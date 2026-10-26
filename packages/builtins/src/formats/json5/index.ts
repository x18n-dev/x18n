import type { MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { LiteralItem, LiteralObject, LiteralScalar, LiteralSyntax } from '../shared/literal'
import { diffText, errors, isMessageTree, pathId } from '@x18n/core'
import JSON5 from 'json5'
import { indentUnit } from '../shared'
import { editLiteral } from '../shared/literal'

const stringToken = /^(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')/

function parse(text: string, path: string): MessageTree {
  let data: unknown
  try {
    data = JSON5.parse(text)
  }
  catch (error) {
    throw errors.X18N2002({
      path,
      reason: error instanceof Error
        ? error.message
        : String(error),
      cause: error,
    })
  }
  if (!isMessageTree(data))
    throw errors.X18N2003({ path })
  return data
}

/** Where the keys and values of valid JSON5 that holds a message tree are. */
function scan(text: string): { root: LiteralObject, ranges: Map<string, NodeRange> } {
  const ranges = new Map<string, NodeRange>()
  let pos = 0
  const skip = (): void => {
    pos += /^(?:\s|\/\/.*|\/\*[\s\S]*?\*\/)*/.exec(text.slice(pos))![0].length
  }
  const token = (pattern: RegExp): TextRange => {
    const start = pos
    pos += pattern.exec(text.slice(pos))![0].length
    return { start, end: pos }
  }
  const inner = (range: TextRange, quoted: boolean): TextRange => quoted
    ? { start: range.start + 1, end: range.end - 1 }
    : range
  const scalar = (): LiteralScalar => {
    const quote = text[pos] === '"' || text[pos] === '\''
      ? text[pos]
      : undefined
    return {
      kind: 'scalar',
      range: token(quote
        ? stringToken
        : /^[^\s,}/]+/),
      quote,
    }
  }
  const object = (path: readonly string[]): LiteralObject => {
    const start = pos++
    const items: LiteralItem[] = []
    skip()
    while (text[pos] !== '}') {
      const quoted = text[pos] === '"' || text[pos] === '\''
      const keyRange = token(quoted
        ? stringToken
        : /^[^\s:/]+/)
      // JSON5 decodes the quotes and escapes of the key.
      const key = Object.keys(JSON5.parse(`{${text.slice(keyRange.start, keyRange.end)}:0}`))[0]!
      skip()
      pos++
      skip()
      const value = text[pos] === '{'
        ? object([...path, key])
        : scalar()
      ranges.set(pathId([...path, key]), {
        key: inner(keyRange, quoted),
        value: inner(value.range, value.kind === 'scalar' && value.quote !== undefined),
      })
      items.push({
        key,
        range: { start: keyRange.start, end: value.range.end },
        value,
      })
      skip()
      if (text[pos] === ',')
        pos++
      skip()
    }
    pos++
    return {
      kind: 'object',
      range: { start, end: pos },
      items,
    }
  }
  skip()
  return {
    root: object([]),
    ranges,
  }
}

function firstQuote(object: LiteralObject): string | undefined {
  for (const { value } of object.items) {
    const quote = value.kind === 'scalar'
      ? value.quote
      : firstQuote(value)
    if (quote)
      return quote
  }
  return undefined
}

/** New keys and strings follow the file: quoted keys if its first key is quoted, and the quote of its first string. */
function syntaxOf(text: string, root: LiteralObject, indent: number | 'tab' | undefined): LiteralSyntax {
  const first = root.items[0]
  const keyQuote = first && /^["']/.test(text[first.range.start]!)
    ? text[first.range.start]
    : undefined
  const quote = firstQuote(root) ?? '"'
  return {
    open: '{',
    close: '}',
    separator: ': ',
    key: key => keyQuote
      ? JSON5.stringify(key, { quote: keyQuote })
      : /^[a-z_$][\w$]*$/i.test(key)
        ? key
        : JSON5.stringify(key, { quote }),
    leaf: (value, current) => JSON5.stringify(value, { quote: current ?? quote }),
    unit: indentUnit(text, indent, '  '),
    trailingComma: false,
  }
}

export function json5(): Plugin {
  return {
    name: 'x18n:format-json5',
    formats: [
      {
        id: 'json5',
        extensions: ['json5'],
        parse(text, ctx) {
          if (text.trim() === '') {
            return {
              tree: {},
              ranges: new Map(),
            }
          }
          return {
            tree: parse(text, ctx.path),
            ranges: scan(text).ranges,
          }
        },
        edit(text, ops, ctx) {
          let next = text.trim() === ''
            ? '{}\n'
            : text
          for (const op of ops) {
            parse(next, ctx.path)
            const { root } = scan(next)
            next = editLiteral(next, root, op, syntaxOf(next, root, ctx.indent))
          }
          return diffText(text, next)
        },
        serialize: (tree, ctx) => `${JSON5.stringify(tree, null, ctx.indent === 'tab'
          ? '\t'
          : ctx.indent ?? 2)}\n`,
      },
    ],
  }
}

export default json5

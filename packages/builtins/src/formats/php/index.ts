import type { MessageLeaf, MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { LiteralItem, LiteralObject, LiteralScalar, LiteralSyntax } from '../shared/literal'
import { applyMessageOps, diffText, errors, pathId } from '@x18n/core'
import { editLiteral, literalText } from '../shared/literal'

type Value = PhpArray | PhpScalar

interface PhpArray extends LiteralObject {
  readonly items: readonly Item[]
}

interface PhpScalar extends LiteralScalar {
  readonly value: MessageLeaf
}

interface Item extends LiteralItem {
  /** The key without its quotes. */
  readonly keyRange: TextRange
  readonly value: Value
}

const doubleEscapes: Record<string, string> = {
  'n': '\n',
  't': '\t',
  'r': '\r',
  'v': '\v',
  'e': '\x1B',
  'f': '\f',
  '\\': '\\',
  '$': '$',
  '"': '"',
}

type Fail = (code: 'X18N2002' | 'X18N2003' | 'X18N2004', reason: string) => never

function decodeDouble(raw: string, fail: Fail): string {
  if (/(?:^|[^\\])(?:\\\\)*(?:\$[a-z_{]|\{\$)/i.test(raw))
    fail('X18N2004', 'variable interpolation in a string')
  return raw.replace(/\\(u\{[0-9a-f]+\}|x[0-9a-f]{1,2}|[0-7]{1,3}|[\s\S])/gi, (match, escape: string) => {
    if (/^u\{/i.test(escape))
      return String.fromCodePoint(Number.parseInt(escape.slice(2, -1), 16))
    if (/^x[0-9a-f]/i.test(escape))
      return String.fromCharCode(Number.parseInt(escape.slice(1), 16))
    if (/^[0-7]/.test(escape))
      return String.fromCharCode(Number.parseInt(escape, 8))
    return doubleEscapes[escape] ?? match
  })
}

function parseFile(text: string, path: string): PhpArray | undefined {
  let pos = 0
  const fail: Fail = (code, reason) => {
    throw errors[code]({ path, line: text.slice(0, pos).split('\n').length, reason })
  }
  const skip = (): void => {
    for (;;) {
      const rest = text.slice(pos)
      const blank = /^(?:\s+|\/\/[^\n]*|#(?!\[)[^\n]*|\/\*[\s\S]*?\*\/)/.exec(rest)
      if (!blank)
        return
      pos += blank[0].length
    }
  }
  const eat = (pattern: RegExp): string | undefined => {
    skip()
    const match = pattern.exec(text.slice(pos))
    if (match)
      pos += match[0].length
    return match?.[0]
  }

  const parseString = (quote: string): Value => {
    const start = pos
    const match = (quote === '\''
      ? /^'(?:[^'\\]|\\[\s\S])*'/
      : /^"(?:[^"\\]|\\[\s\S])*"/).exec(text.slice(pos))
    if (!match)
      return fail('X18N2002', 'unterminated string')
    pos += match[0].length
    const raw = match[0].slice(1, -1)
    const value = quote === '\''
      ? raw.replace(/\\([\\'])/g, '$1')
      : decodeDouble(raw, fail)
    return {
      kind: 'scalar',
      range: { start, end: pos },
      value,
      quote,
    }
  }

  const parseArray = (start: number, close: string): Value => {
    const closing = close === ']'
      ? /^\]/
      : /^\)/
    const items: Item[] = []
    while (!eat(closing)) {
      const key = parseValue()
      if (!eat(/^=>/))
        return fail('X18N2003', 'array item without a key')
      if (key.kind !== 'scalar' || (typeof key.value !== 'string' && typeof key.value !== 'number'))
        return fail('X18N2004', 'array keys must be strings or integers')
      const value = parseValue()
      items.push({
        key: String(key.value),
        range: { start: key.range.start, end: value.range.end },
        keyRange: key.quote
          ? { start: key.range.start + 1, end: key.range.end - 1 }
          : key.range,
        value,
      })
      if (eat(/^,/))
        continue
      skip()
      // The last item may go without a trailing comma.
      if (text[pos] !== close)
        return fail('X18N2004', `expected "," or "${close}"; expressions are not static`)
    }
    return {
      kind: 'object',
      range: { start, end: pos },
      items,
    }
  }

  function parseValue(): Value {
    skip()
    const start = pos
    if (eat(/^\[/))
      return parseArray(start, ']')
    if (eat(/^array\s*\(/i))
      return parseArray(start, ')')
    if (text[pos] === '\'' || text[pos] === '"')
      return parseString(text[pos]!)
    const literal = eat(/^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)\b/i)
    if (literal === undefined)
      return fail('X18N2004', `"${text.slice(pos, pos + 20).split('\n')[0]}" is not a static value`)
    const lower = literal.toLowerCase()
    const value = lower === 'null'
      ? null
      : lower === 'true'
        ? true
        : lower === 'false'
          ? false
          : Number(literal)
    return {
      kind: 'scalar',
      range: { start, end: pos },
      value,
      quote: undefined,
    }
  }

  eat(/^<\?php\b/i)
  if (eat(/^$/) !== undefined)
    return undefined
  eat(/^declare\s*\([^)]*\)\s*;/i)
  if (!eat(/^return\b/i))
    fail('X18N2004', 'expected `return [ ... ];`')
  const root = parseValue()
  if (root.kind !== 'object')
    fail('X18N2003', 'the file must return an array')
  if (!eat(/^;/))
    fail('X18N2004', 'expected ";" after the array; expressions are not static')
  eat(/^\?>/)
  if (eat(/^$/) === undefined)
    fail('X18N2002', 'unexpected text after the array')
  return root
}

function readTree(value: Value, path: readonly string[], ranges: Map<string, NodeRange>): MessageTree {
  const out: Record<string, MessageTree | MessageLeaf> = {}
  if (value.kind !== 'object')
    return out
  for (const item of value.items) {
    const childPath = [...path, item.key]
    const inner = item.value.kind === 'scalar' && item.value.quote
      ? { start: item.value.range.start + 1, end: item.value.range.end - 1 }
      : item.value.range
    ranges.set(pathId(childPath), { key: item.keyRange, value: inner })
    out[item.key] = item.value.kind === 'object'
      ? readTree(item.value, childPath, ranges)
      : item.value.value
  }
  return out
}

const doubleEncodings: Record<string, string> = {
  '\n': '\\n',
  '\t': '\\t',
  '\r': '\\r',
  '\v': '\\v',
  '\f': '\\f',
}

function literal(value: MessageLeaf, quote: string | undefined): string {
  if (typeof value !== 'string')
    return String(value)
  // Control characters read better as escapes than as raw bytes inside single quotes.
  if (quote === '"' || /[\n\r\t\v\f]/.test(value))
    return `"${value.replace(/[\\"$\n\t\r\v\f]/g, char => doubleEncodings[char] ?? `\\${char}`)}"`
  return `'${value.replace(/[\\']/g, '\\$&')}'`
}

/** The indent unit is the configured one, else the file's (first indented item), else 4 spaces. */
function syntaxOf(text: string, indent: number | 'tab' | undefined): LiteralSyntax {
  return {
    open: '[',
    close: ']',
    separator: ' => ',
    key: key => literal(key, '\''),
    leaf: (value, quote) => literal(value, quote),
    unit: indent === undefined
      ? /^([ \t]+)['"\]]/m.exec(text)?.[1] ?? '    '
      : indent === 'tab'
        ? '\t'
        : ' '.repeat(indent),
    trailingComma: true,
  }
}

function applyOp(text: string, op: MessageOp, path: string, syntax: LiteralSyntax): string {
  const root = parseFile(text, path)
  return root
    ? editLiteral(text, root, op, syntax)
    : `${text.trim() === ''
      ? '<?php'
      : text.trimEnd()}\n\nreturn ${literalText(applyMessageOps({}, [op]), syntax)};\n`
}

export function php(): Plugin {
  return {
    name: 'x18n:format-php',
    formats: [
      {
        id: 'php',
        extensions: ['php'],
        parse(text, ctx) {
          const root = parseFile(text, ctx.path)
          const ranges = new Map<string, NodeRange>()
          return {
            tree: root
              ? readTree(root, [], ranges)
              : {},
            ranges,
          }
        },
        edit(text, ops, ctx) {
          const syntax = syntaxOf(text, ctx.indent)
          let next = text
          for (const op of ops)
            next = applyOp(next, op, ctx.path, syntax)
          return diffText(text, next)
        },
        serialize: (tree, ctx) => `<?php\n\nreturn ${literalText(tree, syntaxOf('', ctx.indent))};\n`,
      },
    ],
  }
}

export default php

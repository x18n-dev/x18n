import type { MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import { diffText, errors, pathId, walkLeaves } from '@x18n/core'
import { appendLines, leafText, splice, splitLines } from '../shared'

interface Entry {
  readonly key: string
  readonly value: string
  readonly range: NodeRange
  /** The logical line, through its line break. */
  readonly line: TextRange
}

const escapes: Record<string, string> = { t: '\t', n: '\n', r: '\r', f: '\f' }
const isSpace = (char: string | undefined): boolean => char === ' ' || char === '\t' || char === '\f'

function unescape(raw: string, path: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!
    if (char !== '\\') {
      out += char
      continue
    }
    const next = raw[++i]
    if (next === undefined)
      break
    if (next === '\r' || next === '\n') {
      // Line continuation: drop the break and the next line's leading whitespace.
      if (next === '\r' && raw[i + 1] === '\n')
        i++
      while (isSpace(raw[i + 1]))
        i++
    }
    else if (next === 'u') {
      const hex = raw.slice(i + 1, i + 5)
      if (!/^[0-9a-f]{4}$/i.test(hex))
        throw errors.X18N2002({ path, reason: `malformed \\u escape "\\u${hex}"` })
      out += String.fromCharCode(Number.parseInt(hex, 16))
      i += 4
    }
    else {
      out += escapes[next] ?? next
    }
  }
  return out
}

function read(text: string, path: string): Entry[] {
  const entries: Entry[] = []
  const lines = splitLines(text)
  for (let i = 0; i < lines.length; i++) {
    let p = lines[i]!.start
    const lineStart = p
    while (isSpace(text[p]))
      p++
    if (p >= lines[i]!.end || text[p] === '#' || text[p] === '!')
      continue
    // A line ending in an odd number of backslashes continues on the next one.
    while (i < lines.length - 1 && /(?:^|[^\\])(?:\\\\)*\\$/.test(text.slice(lines[i]!.start, lines[i]!.end)))
      i++
    const end = lines[i]!.end
    const keyStart = p
    while (p < end && !'=: \t\f'.includes(text[p]!)) {
      p += text[p] === '\\'
        ? 2
        : 1
    }
    const keyEnd = Math.min(p, end)
    while (isSpace(text[p]))
      p++
    if (text[p] === '=' || text[p] === ':')
      p++
    while (isSpace(text[p]))
      p++
    const valueStart = Math.min(p, end)
    entries.push({
      key: unescape(text.slice(keyStart, keyEnd), path),
      value: unescape(text.slice(valueStart, end), path),
      range: {
        key: { start: keyStart, end: keyEnd },
        value: { start: valueStart, end },
      },
      line: { start: lineStart, end: lines[i]!.next },
    })
  }
  return entries
}

const encodings: Record<string, string> = {
  '\\': '\\\\',
  '\t': '\\t',
  '\n': '\\n',
  '\r': '\\r',
  '\f': '\\f',
}
const escapeText = (text: string): string => text.replace(/[\\\n\r\t\f]/g, char => encodings[char]!)

const escapeKey = (key: string): string => escapeText(key).replace(/[=: #!]/g, '\\$&')
const escapeValue = (value: string): string => escapeText(value).replace(/^ /, '\\ ')

function applyOp(text: string, op: MessageOp, path: string): string {
  const key = op.path.join('.')
  const entries = read(text, path)
  const entry = entries.findLast(e => e.key === key)
  if (op.type === 'delete') {
    return entry
      ? splice(text, entry.line, '')
      : text
  }
  const value = escapeValue(leafText(op.value))
  if (entry)
    return splice(text, entry.range.value, value)
  const last = entries.findLast(e => e.value !== '')
  const separator = last
    ? text.slice(last.range.key.end, last.range.value.start)
    : ''
  return appendLines(text, `${escapeKey(key)}${/[=:\s]/.test(separator)
    ? separator
    : '='}${value}\n`)
}

export function properties(): Plugin {
  return {
    name: 'x18n:format-properties',
    formats: [
      {
        id: 'properties',
        extensions: ['properties'],
        parse(text, ctx) {
          const tree: Record<string, string> = {}
          const ranges = new Map<string, NodeRange>()
          for (const entry of read(text, ctx.path)) {
            tree[entry.key] = entry.value
            ranges.set(pathId([entry.key]), entry.range)
          }
          return { tree, ranges }
        },
        edit(text, ops, ctx) {
          let next = text
          for (const op of ops)
            next = applyOp(next, op, ctx.path)
          return diffText(text, next)
        },
        serialize: (tree: MessageTree) => [
          ...walkLeaves(tree),
        ]
          .map(leaf => `${escapeKey(leaf.path.join('.'))}=${escapeValue(leafText(leaf.value))}\n`)
          .join(''),
      },
    ],
  }
}

export default properties

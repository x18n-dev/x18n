import type { MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import { diffText, errors, pathId, walkLeaves } from '@x18n/core'
import { detectEol, leafText, splice } from './shared'

interface Entry {
  readonly key: string
  readonly value: string
  readonly range: NodeRange
  /** The `<value>` body; absent for `<data name="x" />`. */
  readonly body: TextRange | undefined
  /** The `<data>` element. */
  readonly element: TextRange
  /** The element with its indent and line break. */
  readonly line: TextRange
  readonly indent: string
}

const entities: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'' }

function decode(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[\da-f]+|#\d+|\w+);/gi, (match, cdata: string | undefined, name: string | undefined) => {
    if (name === undefined)
      return cdata ?? match
    if (name.startsWith('#'))
      return String.fromCodePoint(name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10))
    return entities[name] ?? match
  })
}

const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttribute = (text: string): string => escapeText(text).replace(/"/g, '&quot;')

const isSpace = (char: string | undefined): boolean => char === ' ' || char === '\t'

/** The range with its indent and line break when it stands on a line of its own. */
function lineOf(text: string, range: TextRange): TextRange {
  let start = range.start
  while (isSpace(text[start - 1]))
    start--
  let end = range.end
  while (isSpace(text[end]))
    end++
  if (text[end] === '\r')
    end++
  if (text[end] === '\n')
    end++
  const ownLine = (start === 0 || text[start - 1] === '\n') && (end === text.length || text[end - 1] === '\n')
  return ownLine ? { start, end } : range
}

/** Comments and CDATA are skipped so the schema sample in the standard header is not read as data. */
const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<data\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g

function read(text: string, path: string): Entry[] {
  const entries: Entry[] = []
  tokens.lastIndex = 0
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    const attributes = match[1]
    if (attributes === undefined)
      continue
    const start = match.index
    const open = start + match[0].length
    const selfClosing = attributes.endsWith('/')
    const close = selfClosing ? open : text.indexOf('</data>', open)
    if (close === -1)
      throw errors.X18N2002({ path, reason: 'unclosed <data> element' })
    const end = selfClosing ? open : close + '</data>'.length
    tokens.lastIndex = end
    const name = /\sname\s*=\s*(?:"([^"]*)"|'([^']*)')/d.exec(attributes)
    // Files, images and other objects carry a `type` or `mimetype`; only strings are messages.
    if (!name || /\s(?:type|mimetype)\s*=/.test(attributes))
      continue
    const nameAt = name.indices![1] ?? name.indices![2]!
    const value = /<value\s*>([\s\S]*?)<\/value\s*>/d.exec(text.slice(open, close))
    const body = value ? { start: open + value.indices![1]![0], end: open + value.indices![1]![1] } : undefined
    const line = lineOf(text, { start, end })
    const keyOffset = start + '<data'.length
    entries.push({
      key: decode(name[1] ?? name[2]!),
      value: value ? decode(value[1]!) : '',
      range: { key: { start: keyOffset + nameAt[0], end: keyOffset + nameAt[1] }, value: body ?? { start: open, end: open } },
      body,
      element: { start, end },
      line,
      indent: line.start < start ? text.slice(line.start, start) : '',
    })
  }
  return entries
}

function dataElement(key: string, value: string, indent: string, eol: string): string {
  return `<data name="${escapeAttribute(key)}" xml:space="preserve">${eol}${indent.repeat(2)}<value>${value}</value>${eol}${indent}</data>`
}

function applyOp(text: string, op: MessageOp, path: string): string {
  const key = op.path.join('.')
  const entries = read(text, path)
  const entry = entries.findLast(e => e.key === key)
  if (op.type === 'delete')
    return entry ? splice(text, entry.line, '') : text
  const eol = detectEol(text)
  const value = escapeText(leafText(op.value)).replace(/\n/g, eol)
  if (entry?.body)
    return splice(text, entry.body, value)
  if (entry)
    return splice(text, entry.element, dataElement(key, value, entry.indent, eol))
  const root = text.lastIndexOf('</root>')
  if (root === -1)
    throw errors.X18N2002({ path, reason: 'missing </root>' })
  const indent = entries.at(-1)?.indent ?? [...text.matchAll(/^([ \t]*)<resheader\b/gm)].at(-1)?.[1] ?? '  '
  let at = root
  while (isSpace(text[at - 1]))
    at--
  const lead = at === 0 || text[at - 1] === '\n' ? '' : eol
  return splice(text, { start: at, end: at }, `${lead}${indent}${dataElement(key, value, indent, eol)}${eol}`)
}

const headers: readonly (readonly [string, string])[] = [
  ['resmimetype', 'text/microsoft-resx'],
  ['version', '2.0'],
  ['reader', 'System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'],
  ['writer', 'System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'],
]

const skeleton = `<?xml version="1.0" encoding="utf-8"?>\n<root>\n${headers.map(([name, value]) => `  <resheader name="${name}">\n    <value>${value}</value>\n  </resheader>\n`).join('')}</root>\n`

/** .NET `.resx` files: `<data name="key"><value>text</value></data>` inside `<root>`. */
export function resx(): Plugin {
  return {
    name: 'x18n:format-resx',
    formats: [{
      id: 'resx',
      extensions: ['resx'],
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
      serialize: (tree: MessageTree, ctx) => [...walkLeaves(tree)]
        .reduce((text, leaf) => applyOp(text, { type: 'set', path: leaf.path, value: leaf.value }, ctx.path), skeleton),
    }],
  }
}

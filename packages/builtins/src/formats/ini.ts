import type { MessageLeaf, MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { TextLine } from './shared'
import { buildTree, diffText, errors, isMessageLeaf, pathId } from '@x18n/core'
import { appendLines, detectEol, leafText, splice, splitLines } from './shared'

interface Entry {
  readonly path: readonly string[]
  readonly section: string
  readonly value: string
  readonly range: NodeRange
  /** The value as written, quotes included: what a set replaces. */
  readonly source: TextRange
  readonly line: TextLine
}

interface Section {
  readonly name: string
  readonly line: TextLine
}

/** Reads the value after `=`; `start` is its first non-blank offset. */
function readValue(text: string, start: number, end: number, fail: (message: string) => never): Pick<Entry, 'value' | 'source'> & { inner: TextRange } {
  const quote = text[start]
  if (quote === '"' || quote === '\'') {
    const close = quote === '"' ? /^"(?:[^"\\]|\\.)*"/.exec(text.slice(start, end)) : /^'[^']*'/.exec(text.slice(start, end))
    if (!close || !/^\s*(?:[;#].*)?$/.test(text.slice(start + close[0].length, end)))
      fail('unterminated or malformed quoted value')
    const raw = close![0]
    let value = raw.slice(1, -1)
    if (quote === '"') {
      try {
        value = JSON.parse(raw) as string // a double-quoted JSON string literal always parses to a string
      }
      catch {
        fail(`invalid escape in ${raw}`)
      }
    }
    return { value, source: { start, end: start + raw.length }, inner: { start: start + 1, end: start + raw.length - 1 } }
  }
  // An inline comment needs a blank before it, so `#` and `;` can appear in values.
  const comment = /\s[;#]/.exec(text.slice(start, end))
  const valueEnd = start + text.slice(start, comment ? start + comment.index : end).trimEnd().length
  const range = { start, end: valueEnd }
  return { value: text.slice(start, valueEnd), source: range, inner: range }
}

function read(text: string, path: string): { entries: Entry[], sections: Section[] } {
  const entries: Entry[] = []
  const sections: Section[] = []
  let section = ''
  let lineNumber = 0
  const fail = (message: string): never => {
    throw errors.X18N2002({ path, line: lineNumber, reason: message })
  }
  for (const line of splitLines(text)) {
    lineNumber++
    const content = text.slice(line.start, line.end)
    const trimmed = content.trim()
    if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#'))
      continue
    const header = /^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/.exec(content)
    if (header) {
      section = header[1]!.trim()
      sections.push({ name: section, line })
      continue
    }
    const eq = content.indexOf('=')
    if (eq === -1)
      fail(`expected "key = value", got "${trimmed.slice(0, 20)}"`)
    const key = content.slice(0, eq).trim()
    if (key === '')
      fail('empty key')
    const keyStart = line.start + content.indexOf(key)
    const valueStart = line.start + eq + 1 + /^\s*/.exec(content.slice(eq + 1))![0].length
    const { value, source, inner } = readValue(text, valueStart, line.end, fail)
    entries.push({
      path: [...(section ? section.split('.') : []), key],
      section,
      value,
      range: { key: { start: keyStart, end: keyStart + key.length }, value: inner },
      source,
      line,
    })
  }
  return { entries, sections }
}

function encode(value: string, quote: string | undefined): string {
  if (quote === '\'' && !/['\r\n]/.test(value))
    return `'${value}'`
  const needsQuotes = quote === '"' || quote === '\'' || /^\s|\s$|[\r\n"';#]|^\[/.test(value)
  return needsQuotes ? JSON.stringify(value) : value
}

function insertLine(text: string, at: number, line: string): string {
  const eol = detectEol(text)
  const lead = at === text.length && text !== '' && !text.endsWith('\n') ? eol : ''
  return splice(text, { start: at, end: at }, `${lead}${line}${eol}`)
}

function applyOp(text: string, op: MessageOp, path: string): string {
  const { entries, sections } = read(text, path)
  const id = pathId(op.path)
  const entry = entries.findLast(e => pathId(e.path) === id)
  if (op.type === 'delete')
    return entry ? splice(text, { start: entry.line.start, end: entry.line.next }, '') : text
  const value = leafText(op.value)
  if (entry)
    return splice(text, entry.source, encode(value, text[entry.source.start]))
  const section = op.path.slice(0, -1).join('.')
  const last = entries.findLast(e => e.source.end > e.source.start)
  const line = `${op.path.at(-1)}${last ? text.slice(last.range.key.end, last.source.start) : ' = '}${encode(value, undefined)}`
  const anchor = entries.findLast(e => e.section === section)?.line ?? sections.find(s => s.name === section)?.line
  if (anchor)
    return insertLine(text, anchor.next, line)
  if (section === '')
    return insertLine(text, sections[0]?.line.start ?? text.length, line)
  return appendLines(text, `${text.trim() === '' ? '' : '\n'}[${section}]\n${line}\n`)
}

function serialize(tree: MessageTree): string {
  const blocks: string[] = []
  const visit = (node: MessageTree, path: readonly string[]): void => {
    const children = Object.entries(node)
    const leaves = children.filter((child): child is [string, MessageLeaf] => isMessageLeaf(child[1]))
    if (leaves.length > 0)
      blocks.push(`${path.length > 0 ? `[${path.join('.')}]\n` : ''}${leaves.map(([key, value]) => `${key} = ${encode(leafText(value), undefined)}\n`).join('')}`)
    for (const [key, child] of children) {
      if (!isMessageLeaf(child))
        visit(child, [...path, key])
    }
  }
  visit(tree, [])
  return blocks.join('\n')
}

export function ini(): Plugin {
  return {
    name: 'x18n:format-ini',
    formats: [{
      id: 'ini',
      extensions: ['ini'],
      parse(text, ctx) {
        const { entries } = read(text, ctx.path)
        const ranges = new Map<string, NodeRange>(entries.map(e => [pathId(e.path), e.range]))
        return { tree: buildTree(entries), ranges }
      },
      edit(text, ops, ctx) {
        let next = text
        for (const op of ops)
          next = applyOp(next, op, ctx.path)
        return diffText(text, next)
      },
      serialize,
    }],
  }
}

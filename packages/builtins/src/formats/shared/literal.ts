import type { MessageLeaf, MessageOp, MessageTree, TextRange } from '@x18n/core'
import { isMessageLeaf } from '@x18n/core'
import { detectEol, splice } from './index'

/** A value in a nested key-value literal, as JSON, JSON5, JS and PHP write it. */
type LiteralValue = LiteralObject | LiteralScalar

export interface LiteralScalar {
  readonly kind: 'scalar'
  /** The whole value, quotes included. */
  readonly range: TextRange
  readonly quote: string | undefined
}

export interface LiteralObject {
  readonly kind: 'object'
  /** From the opening to the closing bracket. */
  readonly range: TextRange
  readonly items: readonly LiteralItem[]
}

export interface LiteralItem {
  readonly key: string
  /** From the start of the key to the end of the value. */
  readonly range: TextRange
  readonly value: LiteralValue
}

export interface LiteralSyntax {
  readonly open: string
  readonly close: string
  /** Between a key and its value, such as `: ` or ` => `. */
  readonly separator: string
  readonly key: (key: string) => string
  /** `quote` is the quote of the value that is replaced, if any. */
  readonly leaf: (value: MessageLeaf, quote: string | undefined) => string
  /** One indent level. */
  readonly unit: string
  /** For a file without entries. Otherwise the last entry of the file's object decides. */
  readonly trailingComma: boolean
}

/** Prints a value at `depth`. Objects span lines, one entry per line. */
export function literalText(value: MessageTree | MessageLeaf, syntax: LiteralSyntax, depth = 0): string {
  if (isMessageLeaf(value))
    return syntax.leaf(value, undefined)
  const entries = Object.entries(value)
  if (entries.length === 0)
    return `${syntax.open}${syntax.close}`
  const pad = syntax.unit.repeat(depth + 1)
  const lines = entries.map(([key, child]) => `${pad}${syntax.key(key)}${syntax.separator}${literalText(child, syntax, depth + 1)}`)
  return `${syntax.open}\n${lines.join(',\n')}${syntax.trailingComma
    ? ','
    : ''}\n${syntax.unit.repeat(depth)}${syntax.close}`
}

/** Applies one op to the text of `root` and leaves everything else as it is: comments, quotes, order and layout. */
export function editLiteral(text: string, root: LiteralObject, op: MessageOp, syntax: LiteralSyntax): string {
  const last = root.items.at(-1)
  const style: LiteralSyntax = last
    ? { ...syntax, trailingComma: commaAfter(text, last.range.end) !== undefined }
    : syntax
  let node: LiteralValue = root
  let depth = 0
  while (depth < op.path.length && node.kind === 'object') {
    const object: LiteralObject = node
    const item = object.items.findLast(i => i.key === op.path[depth])
    if (!item)
      break
    if (op.type === 'delete' && depth === op.path.length - 1)
      return removeItem(text, object, item)
    node = item.value
    depth++
  }
  if (op.type === 'delete')
    return text
  const rest = op.path.slice(depth)
  if (node.kind === 'object' && rest.length > 0)
    return insertItem(text, node, rest, op.value, style)
  // The value itself, or a leaf on the way that becomes an object.
  const value = nest(rest, op.value)
  return splice(text, node.range, isMessageLeaf(value)
    ? style.leaf(value, node.kind === 'scalar'
        ? node.quote
        : undefined)
    : reindent(literalText(value, style), indentAt(text, node.range.start), detectEol(text)))
}

function nest(path: readonly string[], value: MessageLeaf): MessageTree | MessageLeaf {
  return path.reduceRight<MessageTree | MessageLeaf>((child, segment) => ({ [segment]: child }), value)
}

function reindent(text: string, indent: string, eol: string): string {
  return text.replace(/\n/g, `${eol}${indent}`)
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1
}

function indentAt(text: string, pos: number): string {
  return /^[ \t]*/.exec(text.slice(lineStart(text, pos)))![0]
}

/** The `,` after a value, past blanks and comments. */
function commaAfter(text: string, pos: number): number | undefined {
  const at = pos + /^(?:\s|\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)*/.exec(text.slice(pos))![0].length
  return text[at] === ','
    ? at
    : undefined
}

/** The end of the line at `pos`, before the line break, when only blanks and a comment follow. */
function lineEnd(text: string, pos: number): number | undefined {
  const end = pos + /^[ \t]*(?:(?:\/\/|#).*|\/\*.*?\*\/[ \t]*)?/.exec(text.slice(pos))![0].length
  return end === text.length || text.startsWith('\n', end) || text.startsWith('\r\n', end)
    ? end
    : undefined
}

function insertItem(text: string, object: LiteralObject, path: readonly string[], value: MessageLeaf, syntax: LiteralSyntax): string {
  const eol = detectEol(text)
  const entry = (indent: string): string => `${syntax.key(path[0]!)}${syntax.separator}${reindent(literalText(nest(path.slice(1), value), syntax), indent, eol)}`
  const first = object.items[0]
  const last = object.items.at(-1)
  if (!first || !last) {
    const base = indentAt(text, object.range.start)
    const indent = base + syntax.unit
    const close = object.range.end - 1
    const blank = /\s*$/.exec(text.slice(object.range.start, close))![0].length
    return splice(text, { start: close - blank, end: close }, `${eol}${indent}${entry(indent)}${syntax.trailingComma
      ? ','
      : ''}${eol}${base}`)
  }
  const comma = commaAfter(text, last.range.end)
  const end = comma === undefined
    ? last.range.end
    : comma + 1
  if (!text.slice(object.range.start, first.range.start).includes('\n')) {
    const indent = indentAt(text, object.range.start)
    return splice(text, { start: end, end }, comma === undefined
      ? `, ${entry(indent)}`
      : ` ${entry(indent)},`)
  }
  const indent = indentAt(text, first.range.start)
  // After the comment that ends the line of the last entry: it belongs to that entry.
  const at = lineEnd(text, end) ?? end
  const next = splice(text, { start: at, end: at }, `${eol}${indent}${entry(indent)}${comma === undefined
    ? ''
    : ','}`)
  return comma === undefined
    ? splice(next, { start: end, end }, ',')
    : next
}

function removeItem(text: string, object: LiteralObject, item: LiteralItem): string {
  const comma = commaAfter(text, item.range.end)
  const end = comma === undefined
    ? item.range.end
    : comma + 1
  const previous = object.items[object.items.indexOf(item) - 1]
  // A last entry without a comma takes the comma before it, so the object keeps its style.
  const before = comma === undefined && previous
    ? commaAfter(text, previous.range.end)
    : undefined
  const close = lineEnd(text, end)
  const opening = text.slice(object.range.start, item.range.start)
  if (object.items.length === 1 && !/\/\/|\/\*|#/.test(opening) && text.slice(close ?? end, object.range.end - 1).trim() === '') {
    // Left empty, with no other comment inside: `{}`.
    return splice(text, { start: object.range.start + opening.trimEnd().length, end: object.range.end - 1 }, '')
  }
  const start = lineStart(text, item.range.start)
  if (close !== undefined && /^[ \t]*$/.test(text.slice(start, item.range.start))) {
    // The entry's own lines go, with the comment that ends them.
    const next = splice(text, { start, end: close + (/^\r?\n/.exec(text.slice(close))?.[0].length ?? 0) }, '')
    return before === undefined
      ? next
      : splice(next, { start: before, end: before + 1 }, '')
  }
  if (before !== undefined)
    return splice(text, { start: before, end }, '')
  return splice(text, { start: item.range.start, end: end + /^[ \t]*/.exec(text.slice(end))![0].length }, '')
}

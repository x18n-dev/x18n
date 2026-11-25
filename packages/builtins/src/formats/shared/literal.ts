import type { MessageLeaf, MessageNode, MessageOp, TextRange } from '@x18n/core'
import { isMessageLeaf, planArrayDelete } from '@x18n/core'
import { detectEol, splice } from './index'

/** A value in a nested key-value literal, as JSON, JSON5, JS and PHP write it. */
type LiteralValue = LiteralObject | LiteralScalar

export interface LiteralScalar {
  readonly kind: 'scalar'
  /** The whole value, quotes included. */
  readonly range: TextRange
  readonly quote: string | undefined
  /** The value is an empty message. Only a format with arrays has to say. */
  readonly empty?: boolean
}

export interface LiteralObject {
  readonly kind: 'object'
  /** From the opening to the closing bracket. */
  readonly range: TextRange
  /** An array: the items are keyed by index and written without a key. */
  readonly array?: boolean
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
  /** Write an array of the tree as `[ ]`, its items without keys. For formats with arrays, such as JSON. */
  readonly arrays?: boolean
  /** One indent level. */
  readonly unit: string
  /** For a file without entries. Otherwise the last entry of the file's object decides. */
  readonly trailingComma: boolean
}

/** Prints a value at `depth`. Objects span lines, one entry per line. */
export function literalText(value: MessageNode, syntax: LiteralSyntax, depth = 0): string {
  if (isMessageLeaf(value))
    return syntax.leaf(value, undefined)
  // A real array prints as one, in a format that has arrays. In any other it is an object keyed by index.
  const array = syntax.arrays === true && Array.isArray(value)
  const entries = Object.entries(value)
  const [open, close] = array
    ? ['[', ']']
    : [syntax.open, syntax.close]
  if (entries.length === 0)
    return `${open}${close}`
  const pad = syntax.unit.repeat(depth + 1)
  const lines = entries.map(([key, child]) => `${pad}${array
    ? ''
    : `${syntax.key(key)}${syntax.separator}`}${literalText(child, syntax, depth + 1)}`)
  return `${open}\n${lines.join(',\n')}${syntax.trailingComma
    ? ','
    : ''}\n${syntax.unit.repeat(depth)}${close}`
}

/** The name of an array item: a whole number without leading zeros. */
const indexName = /^(?:0|[1-9]\d*)$/

/** Applies one op to the text of `root` and leaves everything else as it is: comments, quotes, order and layout. */
export function editLiteral(text: string, root: LiteralObject, op: MessageOp, syntax: LiteralSyntax): string {
  const last = root.items.at(-1)
  const style: LiteralSyntax = last
    ? { ...syntax, trailingComma: commaAfter(text, last.range.end) !== undefined }
    : syntax
  let node: LiteralValue = root
  let depth = 0
  const chain: { object: LiteralObject, item: LiteralItem }[] = []
  while (depth < op.path.length && node.kind === 'object') {
    const object: LiteralObject = node
    const item = object.items.findLast(i => i.key === op.path[depth])
    if (!item)
      break
    chain.push({ object, item })
    if (op.type === 'delete' && depth === op.path.length - 1)
      return deleteAt(text, chain, style)
    node = item.value
    depth++
  }
  if (op.type === 'delete')
    return text
  const rest = op.path.slice(depth)
  const shape = op.shape ?? []
  // A name is not an item: the new path replaces the array, as it replaces a message.
  const named = node.kind === 'object' && node.array === true && rest.length > 0 && !indexName.test(rest[0]!)
  if (node.kind === 'object' && rest.length > 0 && !named)
    return insertItem(text, node, rest, op.value, style, shape.slice(depth))
  // The value itself, or a message or an array on the way that becomes what the path needs.
  const value = build(rest, op.value, named
    ? [
        'object',
        ...shape.slice(depth),
      ]
    : shape.slice(depth - 1))
  return splice(text, node.range, isMessageLeaf(value)
    ? style.leaf(value, node.kind === 'scalar'
        ? node.quote
        : undefined)
    : reindent(literalText(value, style), indentAt(text, node.range.start), detectEol(text)))
}

/** The node for `path`: `kinds[i]` is what holds `path[i]`. An array is filled with empty messages up to its index. */
function build(path: readonly string[], value: MessageLeaf, kinds: readonly ('array' | 'object')[]): MessageNode {
  if (path.length === 0)
    return value
  const child = build(path.slice(1), value, kinds.slice(1))
  return kinds[0] === 'array' && indexName.test(path[0]!)
    ? [
        ...Array.from<string>({
          length: Number(path[0]),
        }).fill(''),
        child,
      ]
    : { [path[0]!]: child }
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

function insertItem(text: string, object: LiteralObject, path: readonly string[], value: MessageLeaf, syntax: LiteralSyntax, kinds: readonly ('array' | 'object')[]): string {
  const eol = detectEol(text)
  // An array takes the value at its end. Past the end, the gap is filled with empty messages.
  const gap = object.array
    ? Math.max(0, Number(path[0]) - object.items.length)
    : 0
  const entry = (indent: string, glue: string): string => [
    ...Array.from({ length: gap }, () => syntax.leaf('', undefined)),
    `${object.array
      ? ''
      : `${syntax.key(path[0]!)}${syntax.separator}`}${reindent(literalText(build(path.slice(1), value, kinds), syntax), indent, eol)}`,
  ].join(glue)
  const first = object.items[0]
  const last = object.items.at(-1)
  if (!first || !last) {
    const base = indentAt(text, object.range.start)
    const indent = base + syntax.unit
    const close = object.range.end - 1
    const blank = /\s*$/.exec(text.slice(object.range.start, close))![0].length
    return splice(text, { start: close - blank, end: close }, `${eol}${indent}${entry(indent, `,${eol}${indent}`)}${syntax.trailingComma
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
      ? `, ${entry(indent, ', ')}`
      : ` ${entry(indent, ', ')},`)
  }
  const indent = indentAt(text, first.range.start)
  // After the comment that ends the line of the last entry: it belongs to that entry.
  const at = lineEnd(text, end) ?? end
  const next = splice(text, { start: at, end: at }, `${eol}${indent}${entry(indent, `,${eol}${indent}`)}${comma === undefined
    ? ''
    : ','}`)
  return comma === undefined
    ? splice(next, { start: end, end }, ',')
    : next
}

/** An empty message, or an object or array with nothing but empty messages in it. */
function isEmptyLiteral(value: LiteralValue): boolean {
  return value.kind === 'scalar'
    ? value.empty === true
    : value.items.every(item => isEmptyLiteral(item.value))
}

/** What stays in an item that is deleted from the middle of an array: the same kind of value, with nothing in it. */
function emptiedText(value: LiteralValue, syntax: LiteralSyntax): string {
  if (value.kind === 'scalar')
    return syntax.leaf('', value.quote)
  return value.array
    ? '[]'
    : `${syntax.open}${syntax.close}`
}

/** Removes the last items of an array, from `from` on. The items before them keep their ranges. */
function removeTail(text: string, object: LiteralObject, from: number): string {
  let current = object
  let next = text
  for (let i = object.items.length - 1; i >= from; i--) {
    const removed = removeItem(next, current, current.items[i]!)
    current = {
      ...current,
      items: current.items.slice(0, i),
      range: { start: current.range.start, end: current.range.end + removed.length - next.length },
    }
    next = removed
  }
  return next
}

/** Deletes the last entry of `chain`, following the same rule as the tree operations (`planArrayDelete`). */
function deleteAt(text: string, chain: readonly { object: LiteralObject, item: LiteralItem }[], syntax: LiteralSyntax): string {
  for (let level = chain.length - 1; level >= 0; level--) {
    const { object, item } = chain[level]!
    if (object.array) {
      const plan = planArrayDelete(object.items.map(i => isEmptyLiteral(i.value)), object.items.indexOf(item))
      if (plan.kind === 'none')
        return text
      if (plan.kind === 'empty')
        return splice(text, item.value.range, emptiedText(item.value, syntax))
      if (plan.from > 0)
        return removeTail(text, object, plan.from)
      // The whole array goes: so does the entry that holds it.
      continue
    }
    // An object left empty inside an array is an empty item: it is deleted from the array.
    if (object.items.length === 1 && chain[level - 1]?.object.array)
      continue
    return removeItem(text, object, item)
  }
  return text
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

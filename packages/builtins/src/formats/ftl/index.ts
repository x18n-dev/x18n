import type { MessageOp, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { TextLine } from '../shared'
import { diffText, errors, pathId, walkLeaves } from '@x18n/core'
import { appendLines, detectEol, leafText, splice, splitLines, withBlankLines } from '../shared'

// Attributes are stored flat as `id.attr`: a message can have both a value and attributes,
// so `id` cannot be a leaf and an object at once.

interface PatternDraft {
  /** Offset right after `=`. */
  readonly after: number
  readonly inline: TextRange
  readonly lines: TextLine[]
}

interface Pattern {
  readonly value: string | undefined
  readonly range: TextRange
  /** From right after `=` to the end of the value: what a set replaces. */
  readonly source: TextRange
}

interface Attribute {
  readonly name: string
  readonly nameRange: TextRange
  readonly pattern: PatternDraft
  readonly lines: { start: number, end: number }
}

interface Message {
  readonly id: string
  readonly idRange: TextRange
  /** From its attached comment to the start of the line after it. */
  readonly block: { start: number, end: number }
  readonly pattern: PatternDraft
  readonly attributes: Attribute[]
}

const trimmedEnd = (text: string, line: TextRange): number => line.start + text.slice(line.start, line.end).trimEnd().length
const indentOf = (text: string, line: TextRange): number => /^[ \t]*/.exec(text.slice(line.start, line.end))![0].length

function finishPattern(text: string, draft: PatternDraft): Pattern {
  const lines = [...draft.lines]
  while (lines.length > 0 && text.slice(lines.at(-1)!.start, lines.at(-1)!.end).trim() === '')
    lines.pop()
  const indent = Math.min(...lines.filter(l => text.slice(l.start, l.end).trim() !== '').map(l => indentOf(text, l)))
  const inline = text.slice(draft.inline.start, draft.inline.end).trimEnd()
  const parts = [
    ...(inline
      ? [inline]
      : []),
    ...lines.map(l => text.slice(Math.min(l.start + indent, l.end), trimmedEnd(text, l))),
  ]
  const first = lines[0]
  if (!inline && !first) {
    return {
      value: undefined,
      range: { start: draft.after, end: draft.after },
      source: { start: draft.after, end: draft.inline.end },
    }
  }
  const start = inline
    ? draft.inline.start
    : first!.start + indent
  const end = lines.length > 0
    ? trimmedEnd(text, lines.at(-1)!)
    : trimmedEnd(text, draft.inline)
  return {
    value: parts.join('\n'),
    range: { start, end },
    source: { start: draft.after, end },
  }
}

function read(text: string, path: string): Message[] {
  const messages: Message[] = []
  let current: Message | undefined
  let commentStart: number | undefined
  let blanks: TextLine[] = []
  let lineNumber = 0
  for (const line of splitLines(text)) {
    lineNumber++
    const content = text.slice(line.start, line.end)
    if (content.trim() === '') {
      blanks.push(line)
      commentStart = undefined
      continue
    }
    if (/^[ \t]/.test(content)) {
      if (!current)
        throw errors.X18N2002({ path, line: lineNumber, reason: 'indented line outside a message' })
      const attribute = /^[ \t]+\.([a-z][\w-]*)[ \t]*=[ \t]*/i.exec(content)
      if (attribute) {
        const nameStart = line.start + attribute[0].indexOf('.') + 1
        const after = line.start + attribute[0].trimEnd().length
        current.attributes.push({
          name: attribute[1]!,
          nameRange: { start: nameStart, end: nameStart + attribute[1]!.length },
          pattern: {
            after,
            inline: { start: line.start + attribute[0].length, end: line.end },
            lines: [],
          },
          lines: { start: line.start, end: line.next },
        })
      }
      else {
        const last = current.attributes.at(-1)
        const owner: { readonly pattern: PatternDraft } = last ?? current
        owner.pattern.lines.push(...blanks, line)
        if (last)
          last.lines.end = line.next
      }
      current.block.end = line.next
      blanks = []
      continue
    }
    blanks = []
    current = undefined
    if (content.startsWith('#')) {
      // Only a `#` comment right above a message belongs to it; `##` and `###` stand alone.
      commentStart = /^#(?: |$)/.test(content)
        ? commentStart ?? line.start
        : undefined
      continue
    }
    const message = /^(-?[a-z][\w-]*)[ \t]*=[ \t]*/i.exec(content)
    if (!message)
      throw errors.X18N2002({ path, line: lineNumber, reason: 'expected a message, a term or a comment' })
    current = {
      id: message[1]!,
      idRange: { start: line.start, end: line.start + message[1]!.length },
      block: { start: commentStart ?? line.start, end: line.next },
      pattern: {
        after: line.start + message[0].trimEnd().length,
        inline: { start: line.start + message[0].length, end: line.end },
        lines: [],
      },
      attributes: [],
    }
    commentStart = undefined
    messages.push(current)
  }
  return messages
}

function encode(value: string, indent: number, eol: string): string {
  if (value === '')
    return ' { "" }'
  const lines = value.split('\n')
  if (lines.length === 1)
    return ` ${value}`
  return lines.map(line => line === ''
    ? eol
    : `${eol}${' '.repeat(indent)}${line}`).join('')
}

function splitKey(key: string): { id: string, attribute: string | undefined } {
  const dot = key.indexOf('.')
  return dot === -1
    ? { id: key, attribute: undefined }
    : {
        id: key.slice(0, dot),
        attribute: key.slice(dot + 1),
      }
}

function setValue(text: string, key: string, value: string, messages: readonly Message[]): string {
  const eol = detectEol(text)
  const { id, attribute } = splitKey(key)
  const message = messages.findLast(m => m.id === id)
  if (!message) {
    return appendLines(text, attribute
      ? `${id} =\n    .${attribute} =${encode(value, 8, '\n')}\n`
      : `${id} =${encode(value, 4, '\n')}\n`)
  }
  if (!attribute)
    return splice(text, finishPattern(text, message.pattern).source, encode(value, 4, eol))
  const existing = message.attributes.findLast(a => a.name === attribute)
  if (existing)
    return splice(text, finishPattern(text, existing.pattern).source, encode(value, indentOf(text, existing.lines) + 4, eol))
  const end = message.block.end
  const lead = end === text.length && !text.endsWith('\n')
    ? eol
    : ''
  return splice(text, { start: end, end }, `${lead}    .${attribute} =${encode(value, 8, eol)}${eol}`)
}

function remove(text: string, key: string, messages: readonly Message[]): string {
  const { id, attribute } = splitKey(key)
  const message = messages.findLast(m => m.id === id)
  if (!message)
    return text
  const pattern = finishPattern(text, message.pattern)
  if (!attribute) {
    if (pattern.value === undefined)
      return text
    // Attributes keep the message alive without a value.
    return message.attributes.length > 0
      ? splice(text, pattern.source, '')
      : splice(text, withBlankLines(text, message.block), '')
  }
  const existing = message.attributes.findLast(a => a.name === attribute)
  if (!existing)
    return text
  if (pattern.value === undefined && message.attributes.length === 1)
    return splice(text, withBlankLines(text, message.block), '')
  return splice(text, existing.lines, '')
}

function applyOp(text: string, op: MessageOp, path: string): string {
  const key = op.path.join('.')
  const messages = read(text, path)
  return op.type === 'set'
    ? setValue(text, key, leafText(op.value), messages)
    : remove(text, key, messages)
}

function serialize(tree: MessageTree): string {
  const messages = new Map<string, { value: string | undefined, attributes: string[] }>()
  for (const leaf of walkLeaves(tree)) {
    const { id, attribute } = splitKey(leaf.path.join('.'))
    const message = messages.get(id) ?? { value: undefined, attributes: [] }
    messages.set(id, message)
    if (attribute)
      message.attributes.push(`    .${attribute} =${encode(leafText(leaf.value), 8, '\n')}\n`)
    else
      message.value = leafText(leaf.value)
  }
  return [...messages].map(([id, m]) => `${id} =${m.value === undefined
    ? ''
    : encode(m.value, 4, '\n')}\n${m.attributes.join('')}`).join('')
}

export function ftl(): Plugin {
  return {
    name: 'x18n:format-ftl',
    formats: [
      {
        id: 'ftl',
        extensions: ['ftl'],
        parse(text, ctx) {
          const tree: Record<string, string> = {}
          const ranges = new Map<string, NodeRange>()
          for (const message of read(text, ctx.path)) {
            const pattern = finishPattern(text, message.pattern)
            if (pattern.value !== undefined) {
              tree[message.id] = pattern.value
              ranges.set(pathId([message.id]), { key: message.idRange, value: pattern.range })
            }
            for (const attribute of message.attributes) {
              const key = `${message.id}.${attribute.name}`
              const value = finishPattern(text, attribute.pattern)
              tree[key] = value.value ?? ''
              ranges.set(pathId([key]), { key: attribute.nameRange, value: value.range })
            }
          }
          return { tree, ranges }
        },
        edit(text, ops, ctx) {
          let next = text
          for (const op of ops)
            next = applyOp(next, op, ctx.path)
          return diffText(text, next)
        },
        serialize,
      },
    ],
  }
}

export default ftl

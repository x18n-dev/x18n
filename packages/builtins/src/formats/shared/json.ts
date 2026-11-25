import type { Format, MessageNode, MessageTree, NodeRange } from '@x18n/core'
import type { Node, ParseError } from 'jsonc-parser'
import type { LiteralObject, LiteralSyntax } from './literal'
import { diffText, errors, pathId } from '@x18n/core'
import { parseTree, printParseErrorCode } from 'jsonc-parser'
import { indentUnit } from './index'
import { editLiteral } from './literal'

interface MutableTree { [segment: string]: MessageNode }

interface Member {
  readonly key: string
  /** Where the member starts: its key for a property, the value for an array item. */
  readonly start: number
  readonly keyRange: { start: number, end: number }
  readonly valueNode: Node
}

/** The members of an object, or the items of an array keyed by index. */
function membersOf(node: Node): Member[] {
  if (node.type === 'array') {
    return (node.children ?? []).map((valueNode, index) => ({
      key: String(index),
      start: valueNode.offset,
      keyRange: { start: valueNode.offset, end: valueNode.offset + valueNode.length },
      valueNode,
    }))
  }
  return (node.children ?? []).flatMap((property) => {
    const [keyNode, valueNode] = property.children ?? []
    if (!keyNode || !valueNode || typeof keyNode.value !== 'string')
      return []
    return [
      {
        key: keyNode.value,
        start: property.offset,
        keyRange: { start: keyNode.offset + 1, end: keyNode.offset + keyNode.length - 1 },
        valueNode,
      },
    ]
  })
}

function readNode(node: Node, path: string[], ranges: Map<string, NodeRange>): MessageNode {
  if (node.type === 'array') {
    return membersOf(node).map(({ key, keyRange, valueNode }) => readMember(valueNode, [...path, key], keyRange, ranges)).filter(item => item !== undefined)
  }
  const out: MutableTree = {}
  for (const { key, keyRange, valueNode } of membersOf(node)) {
    const child = readMember(valueNode, [...path, key], keyRange, ranges)
    if (child !== undefined)
      out[key] = child
  }
  return out
}

/** One property or item: its ranges are recorded, and its value read. Anything but a message, object or array is dropped. */
function readMember(valueNode: Node, path: string[], keyRange: { start: number, end: number }, ranges: Map<string, NodeRange>): MessageNode | undefined {
  ranges.set(pathId(path), {
    key: keyRange,
    value: { start: valueNode.offset, end: valueNode.offset + valueNode.length },
  })
  if (valueNode.type === 'object' || valueNode.type === 'array')
    return readNode(valueNode, path, ranges)
  if (valueNode.type === 'string' || valueNode.type === 'number' || valueNode.type === 'boolean' || valueNode.type === 'null')
    return valueNode.value as string | number | boolean | null // jsonc-parser types `value` loosely; `type` fixes it
  return undefined
}

function objectOf(node: Node): LiteralObject {
  return {
    kind: 'object',
    range: { start: node.offset, end: node.offset + node.length },
    array: node.type === 'array',
    items: membersOf(node).map(({ key, start, valueNode }) => {
      const range = { start: valueNode.offset, end: valueNode.offset + valueNode.length }
      return {
        key,
        range: { start, end: range.end },
        value: valueNode.type === 'object' || valueNode.type === 'array'
          ? objectOf(valueNode)
          : {
              kind: 'scalar' as const,
              range,
              quote: undefined,
              empty: valueNode.value === '',
            },
      }
    }),
  }
}

/** The root object, or undefined for an empty file. */
function parseRoot(text: string, path: string, allowComments: boolean): Node | undefined {
  const problems: ParseError[] = []
  const root = parseTree(text, problems, { allowTrailingComma: true, disallowComments: !allowComments })
  if (problems.length > 0) {
    const first = problems[0]!
    throw errors.X18N2002({ path, reason: `${printParseErrorCode(first.error)} at offset ${first.offset}` })
  }
  if (root?.type === 'object')
    return root
  if (text.trim() === '')
    return undefined
  throw errors.X18N2003({ path })
}

export function createJsonFormat(id: string, extensions: readonly string[], allowComments: boolean, defaultIndent: number | undefined): Format {
  return {
    id,
    extensions,
    parse(text, ctx) {
      const root = parseRoot(text, ctx.path, allowComments)
      const ranges = new Map<string, NodeRange>()
      return {
        tree: root
          ? readNode(root, [], ranges) as MessageTree
          : {},
        ranges,
      }
    },
    edit(text, ops, ctx) {
      const syntax: LiteralSyntax = {
        open: '{',
        close: '}',
        separator: ': ',
        key: key => JSON.stringify(key),
        leaf: value => JSON.stringify(value),
        unit: indentUnit(text, ctx.indent ?? defaultIndent, '  '),
        trailingComma: false,
        arrays: true,
      }
      let next = text.trim() === ''
        ? '{}\n'
        : text
      for (const op of ops)
        next = editLiteral(next, objectOf(parseRoot(next, ctx.path, allowComments)!), op, syntax) // `next` is never blank
      return diffText(text, next)
    },
    serialize(tree, ctx) {
      const indent = ctx.indent ?? defaultIndent ?? 2
      return `${JSON.stringify(tree, null, indent === 'tab'
        ? '\t'
        : indent)}\n`
    },
  }
}

export interface JsonOptions {
  /** Spaces per level for new files. Existing files keep their indent. */
  readonly indent?: number
}

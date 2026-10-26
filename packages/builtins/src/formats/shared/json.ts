import type { Format, MessageTree, NodeRange } from '@x18n/core'
import type { Node, ParseError } from 'jsonc-parser'
import type { LiteralItem, LiteralObject, LiteralSyntax } from './literal'
import { diffText, errors, pathId } from '@x18n/core'
import { parseTree, printParseErrorCode } from 'jsonc-parser'
import { indentUnit } from './index'
import { editLiteral } from './literal'

interface MutableTree { [segment: string]: MutableTree | string | number | boolean | null }

function readTree(node: Node, path: string[], ranges: Map<string, NodeRange>): MessageTree {
  const out: MutableTree = {}
  for (const property of node.children ?? []) {
    const [keyNode, valueNode] = property.children ?? []
    if (!keyNode || !valueNode || typeof keyNode.value !== 'string')
      continue
    const key = keyNode.value
    const childPath = [...path, key]
    ranges.set(pathId(childPath), {
      key: { start: keyNode.offset + 1, end: keyNode.offset + keyNode.length - 1 },
      value: { start: valueNode.offset, end: valueNode.offset + valueNode.length },
    })
    if (valueNode.type === 'object')
      out[key] = readTree(valueNode, childPath, ranges) as MutableTree
    else if (valueNode.type === 'string' || valueNode.type === 'number' || valueNode.type === 'boolean' || valueNode.type === 'null')
      out[key] = valueNode.value as string | number | boolean | null // jsonc-parser types `value` loosely; `type` fixes it
  }
  return out
}

function objectOf(node: Node): LiteralObject {
  const items: LiteralItem[] = []
  for (const property of node.children ?? []) {
    const [keyNode, valueNode] = property.children ?? []
    if (!keyNode || !valueNode || typeof keyNode.value !== 'string')
      continue
    items.push({
      key: keyNode.value,
      range: { start: property.offset, end: property.offset + property.length },
      value: valueNode.type === 'object'
        ? objectOf(valueNode)
        : {
            kind: 'scalar',
            range: { start: valueNode.offset, end: valueNode.offset + valueNode.length },
            quote: undefined,
          },
    })
  }
  return {
    kind: 'object',
    range: { start: node.offset, end: node.offset + node.length },
    items,
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
          ? readTree(root, [], ranges)
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

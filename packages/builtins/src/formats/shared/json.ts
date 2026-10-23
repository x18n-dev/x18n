import type { Format, MessageTree, NodeRange } from '@x18n/core'
import type { Node, ParseError } from 'jsonc-parser'
import { diffText, errors, pathId } from '@x18n/core'
import { applyEdits, modify, parseTree, printParseErrorCode } from 'jsonc-parser'
import { detectEol, detectIndent } from './index'

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

export function createJsonFormat(id: string, extensions: readonly string[], allowComments: boolean, defaultIndent: number | undefined): Format {
  return {
    id,
    extensions,
    parse(text, ctx) {
      const problems: ParseError[] = []
      const root = parseTree(text, problems, { allowTrailingComma: true, disallowComments: !allowComments })
      if (problems.length > 0) {
        const first = problems[0]!
        throw errors.X18N2002({ path: ctx.path, reason: `${printParseErrorCode(first.error)} at offset ${first.offset}` })
      }
      if (!root || root.type !== 'object') {
        if (text.trim() === '') {
          return {
            tree: {},
            ranges: new Map(),
          }
        }
        throw errors.X18N2003({ path: ctx.path })
      }
      const ranges = new Map<string, NodeRange>()
      return {
        tree: readTree(root, [], ranges),
        ranges,
      }
    },
    edit(text, ops, ctx) {
      const indent = detectIndent(text, ctx.indent ?? defaultIndent)
      const formattingOptions = {
        ...indent,
        eol: detectEol(text),
      }
      let next = text.trim() === ''
        ? '{}\n'
        : text
      for (const op of ops) {
        next = applyEdits(next, modify(next, [...op.path], op.type === 'set'
          ? op.value
          : undefined, { formattingOptions }))
      }
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

import type { Format, MessageTree, NodeRange, Plugin, TextRange } from '@x18n/core'
import type { Document, Node as YamlNode } from 'yaml'
import { applyTextEdits, diffText, errors, pathId } from '@x18n/core'
import { isMap, isNode, isScalar, parseDocument, Scalar, stringify, Document as YamlDocument } from 'yaml'
import { toLeaf } from '../shared'

interface MutableTree { [segment: string]: MutableTree | string | number | boolean | null }

function scalarTextRange(node: YamlNode): TextRange | undefined {
  const range = node.range
  if (!range)
    return undefined
  if (isScalar(node) && (node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE))
    return { start: range[0] + 1, end: range[1] - 1 }
  return { start: range[0], end: range[1] }
}

function readMap(node: YamlNode, path: string[], ranges: Map<string, NodeRange>): MessageTree {
  const out: MutableTree = {}
  if (!isMap(node))
    return out
  for (const pair of node.items) {
    const keyNode = pair.key
    if (!isScalar(keyNode))
      continue
    const key = String(keyNode.value)
    const childPath = [...path, key]
    const keyRange = scalarTextRange(keyNode)
    const value = isNode(pair.value)
      ? pair.value
      : undefined
    const valueRange = value && value.range
      ? { start: value.range[0], end: value.range[1] }
      : undefined
    if (keyRange)
      ranges.set(pathId(childPath), { key: keyRange, value: valueRange ?? keyRange })
    if (value === undefined) {
      out[key] = null
    }
    else if (isMap(value)) {
      out[key] = readMap(value, childPath, ranges) as MutableTree
    }
    else if (isScalar(value)) {
      const leaf = toLeaf(value.value)
      if (leaf !== undefined)
        out[key] = leaf
    }
  }
  return out
}

function parse(text: string, path: string): Document.Parsed {
  const doc = parseDocument(text, { keepSourceTokens: true, uniqueKeys: false })
  if (doc.errors.length > 0)
    throw errors.X18N2002({ path, reason: doc.errors[0]!.message })
  return doc
}

function scalarText(value: string | number | boolean | null, type: Scalar['type']): string {
  if (typeof value !== 'string')
    return stringify(value).trimEnd()
  if (type === Scalar.QUOTE_DOUBLE)
    return JSON.stringify(value)
  if (type === Scalar.QUOTE_SINGLE)
    return `'${value.replace(/'/g, '\'\'')}'`
  return stringify(value, { lineWidth: 0 }).trimEnd()
}

function indentOf(text: string): number {
  const match = /^( +)\S/m.exec(text)
  return match?.[1]?.length ?? 2
}

export function yaml(): Plugin {
  const format: Format = {
    id: 'yaml',
    extensions: ['yml', 'yaml'],
    parse(text, ctx) {
      const doc = parse(text, ctx.path)
      const ranges = new Map<string, NodeRange>()
      if (doc.contents === null)
        return { tree: {}, ranges }
      if (!isMap(doc.contents))
        throw errors.X18N2003({ path: ctx.path })
      return {
        tree: readMap(doc.contents, [], ranges),
        ranges,
      }
    },
    edit(text, ops, ctx) {
      let next = text
      for (const op of ops) {
        let doc: Document = parse(next, ctx.path)
        const current = doc.getIn(op.path, true)
        // A single-line scalar keeps its quote style and everything around it.
        if (op.type === 'set' && isScalar(current) && current.range && current.type !== Scalar.BLOCK_FOLDED && current.type !== Scalar.BLOCK_LITERAL) {
          next = applyTextEdits(next, [
            {
              range: { start: current.range[0], end: current.range[1] },
              text: scalarText(op.value, current.type),
            },
          ])
          continue
        }
        if (doc.contents === null)
          doc = new YamlDocument({})
        if (op.type === 'set')
          doc.setIn(op.path, op.value)
        else
          doc.deleteIn(op.path)
        next = doc.toString({
          indent: indentOf(text),
          lineWidth: 0,
        })
      }
      return diffText(text, next)
    },
    serialize: (tree: MessageTree) => Object.keys(tree).length === 0
      ? '{}\n'
      : stringify(tree, { lineWidth: 0 }),
  }
  return {
    name: 'x18n:format-yaml',
    formats: [format],
  }
}

export default yaml

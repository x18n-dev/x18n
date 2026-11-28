import type { MessageLeaf, MessageNode, MessageTree } from './types/model'
import type { MessageOp } from './types/plugin'

export function isMessageLeaf(value: unknown): value is MessageLeaf {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isMessageNode(value: unknown): value is MessageNode {
  if (isMessageLeaf(value))
    return true
  if (Array.isArray(value)) {
    // `every` skips the holes of a sparse array, so the count of own keys checks them.
    return Object.keys(value).length === value.length && value.every(isMessageNode)
  }
  return isMessageTree(value)
}

/** An object of nodes: not a message and not an array. */
export function isMessageObject(node: MessageNode): node is MessageTree {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
}

/** Checks parsed data (for example from `JSON.parse`) before it enters the project. The root is an object. */
export function isMessageTree(value: unknown): value is MessageTree {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  return Object.values(value).every(isMessageNode)
}

/** Stable id of a stored property path, the key of `ParseResult.ranges`. */
export function pathId(path: readonly string[]): string {
  return path.join('\u0000')
}

export interface TreeLeaf {
  readonly path: readonly string[]
  readonly value: MessageLeaf
}

/** The name of an array item: a whole number without leading zeros. */
export const indexName: RegExp = /^(?:0|[1-9]\d*)$/

/** The child at `segment`: an array has only its items, by index, and no `length`. */
export function childOf(node: MessageTree | readonly MessageNode[], segment: string): MessageNode | undefined {
  if (!Array.isArray(node))
    return (node as MessageTree)[segment]
  return indexName.test(segment)
    ? node[Number(segment)]
    : undefined
}

/** The leaves of a tree or an array, an array item named by its index. */
export function* walkLeaves(node: MessageTree | readonly MessageNode[], prefix: readonly string[] = []): Generator<TreeLeaf> {
  for (const [segment, child] of Object.entries(node)) {
    const path = [...prefix, segment]
    if (isMessageLeaf(child))
      yield { path, value: child }
    else
      yield* walkLeaves(child, path)
  }
}

export interface MutableTree { [segment: string]: MutableNode }
type MutableNode = MessageLeaf | MutableTree | MutableNode[]

function cloneNode(node: MessageNode): MutableNode {
  if (isMessageLeaf(node))
    return node
  if (Array.isArray(node))
    return node.map(cloneNode)
  return cloneTree(node as MessageTree)
}

export function cloneTree(tree: MessageTree): MutableTree {
  const out: MutableTree = {}
  for (const [segment, child] of Object.entries(tree))
    out[segment] = cloneNode(child)
  return out
}

type Container = MutableTree | MutableNode[]

const isContainer = (node: MutableNode | undefined): node is Container => typeof node === 'object' && node !== null

function childIn(container: Container, segment: string): MutableNode | undefined {
  if (!Array.isArray(container))
    return container[segment]
  return indexName.test(segment)
    ? container[Number(segment)]
    : undefined
}

/** Puts `value` at `segment`. Past the end of an array the gap is filled with empty messages. */
function assign(container: Container, segment: string, value: MutableNode): void {
  if (!Array.isArray(container)) {
    container[segment] = value
    return
  }
  const index = Number(segment)
  while (container.length < index)
    container.push('')
  container[index] = value
}

function setIn(tree: MutableTree, path: readonly string[], value: MessageLeaf, shape: readonly ('array' | 'object')[] = []): void {
  let node: Container = tree
  let parent: Container | undefined
  let parentSegment = ''
  for (const [depth, segment] of path.entries()) {
    if (Array.isArray(node) && !indexName.test(segment)) {
      // A name cannot be an item: the new path wins, as it does over a message.
      const object: MutableTree = {}
      assign(parent!, parentSegment, object) // an array is never the root
      node = object
    }
    if (depth === path.length - 1) {
      assign(node, segment, value)
      return
    }
    let child = childIn(node, segment)
    if (!isContainer(child)) {
      child = shape[depth] === 'array'
        ? []
        : {}
      assign(node, segment, child)
    }
    parent = node
    parentSegment = segment
    node = child
  }
}

/** An empty message, or a node with nothing but empty messages in it. */
export function isEmptyNode(node: MessageNode): boolean {
  if (isMessageLeaf(node))
    return node === ''
  return Object.values(node).every(isEmptyNode)
}

/** What stays in an item that was deleted from the middle of an array: the same kind of node, with nothing in it. */
function emptied(node: MutableNode): MutableNode {
  if (!isContainer(node))
    return ''
  return Array.isArray(node)
    ? []
    : {}
}

function deleteIn(tree: MutableTree, path: readonly string[]): void {
  const chain: { container: Container, segment: string }[] = []
  let node: Container = tree
  for (const segment of path) {
    const child = childIn(node, segment)
    if (child === undefined)
      return
    chain.push({ container: node, segment })
    if (!isContainer(child)) {
      // Only the last segment may end on a message.
      if (chain.length < path.length)
        return
      break
    }
    node = child
  }
  // Delete from the deepest container, and from the one above it while a container is left empty.
  for (let level = chain.length - 1; level >= 0; level--) {
    const { container, segment } = chain[level]!
    if (Array.isArray(container)) {
      const plan = planArrayDelete(container.map(isEmptyNode), Number(segment))
      if (plan.kind === 'none')
        return
      if (plan.kind === 'empty') {
        container[Number(segment)] = emptied(container[Number(segment)]!)
        return
      }
      container.length = plan.from
    }
    else {
      delete container[segment]
    }
    if (level === 0 || Object.keys(container).length > 0)
      return
  }
}

/** Applies ops to the tree itself. Parent objects left empty are removed. */
export function applyMessageOpsInPlace(tree: MutableTree, ops: readonly MessageOp[]): void {
  for (const op of ops) {
    if (op.type === 'set')
      setIn(tree, op.path, op.value, op.shape)
    else
      deleteIn(tree, op.path)
  }
}

/** Applies ops to a copy of the tree. Parent objects left empty are removed. */
export function applyMessageOps(tree: MessageTree, ops: readonly MessageOp[]): MessageTree {
  const out = cloneTree(tree)
  applyMessageOpsInPlace(out, ops)
  return out
}

function sortNode(node: MessageNode, compare: (a: string, b: string) => number): MessageNode {
  if (isMessageLeaf(node))
    return node
  // An array keeps its order: its items are named by position.
  if (Array.isArray(node))
    return node.map(item => sortNode(item, compare))
  return sortTree(node as MessageTree, compare)
}

/** Sorts the keys of every object. The items of an array keep their order. */
export function sortTree(tree: MessageTree, compare: (a: string, b: string) => number): MessageTree {
  const out: MutableTree = {}
  for (const segment of Object.keys(tree).sort(compare))
    out[segment] = sortNode(tree[segment]!, compare) as MutableNode
  return out
}

/** Builds a nested or flat tree from leaves. */
export function buildTree(leaves: Iterable<TreeLeaf>): MessageTree {
  const out: MutableTree = {}
  for (const leaf of leaves)
    setIn(out, leaf.path, leaf.value)
  return out
}

/** What deleting one item of an array does. */
export type ArrayDeletePlan
  = | { readonly kind: 'empty' }
    | { readonly kind: 'truncate', readonly from: number }
    | { readonly kind: 'none' }

/**
 * How to delete the item at `index` of an array, given which items hold an empty message.
 * An item that a later item still follows is emptied, so every index stays where it is.
 * The last item is cut off together with the empty items right before it. When that leaves nothing,
 * `from` is 0 and the whole array goes. Every format and the tree operations follow this one rule.
 */
export function planArrayDelete(empty: readonly boolean[], index: number): ArrayDeletePlan {
  if (!Number.isInteger(index) || index < 0 || index >= empty.length)
    return { kind: 'none' }
  // The run of empty items at the end of the array, counting the item that is deleted.
  let from = empty.length
  while (from > 0 && (empty[from - 1] || from - 1 === index))
    from--
  return from <= index
    ? { kind: 'truncate', from }
    : { kind: 'empty' }
}

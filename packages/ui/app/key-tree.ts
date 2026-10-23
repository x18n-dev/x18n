/** One line of the key sidebar: a key, or a folder of keys in the tree view. */
export interface KeyRowItem {
  /** Unique: the key, or the folder's path prefix. */
  readonly id: string
  readonly label: string
  readonly depth: number
  /** Set when the line is a key itself; a folder that is also a key has both. */
  readonly key: string | undefined
  readonly branch: boolean
  readonly open: boolean
}

interface Node {
  readonly id: string
  readonly label: string
  key: string | undefined
  readonly children: Map<string, Node>
}

/** Ends of the segments of a key: `ns:a.b` gives `ns`, `ns:a`, `ns:a.b`. */
function prefixes(key: string): { id: string, label: string }[] {
  return [
    ...key.matchAll(/[^.:]+/g),
  ].map(m => ({
    id: key.slice(0, m.index + m[0].length),
    label: m[0],
  }))
}

/** Keys as a tree, folders by `.` and `:`; `all` opens every folder, otherwise only those in `open`. */
export function treeRows(keys: readonly string[], open: ReadonlySet<string>, all = false): KeyRowItem[] {
  const root = new Map<string, Node>()
  for (const key of keys) {
    let level = root
    let node: Node | undefined
    for (const { id, label } of prefixes(key)) {
      node = level.get(label) ?? {
        id,
        label,
        key: undefined,
        children: new Map(),
      }
      level.set(label, node)
      level = node.children
    }
    if (node)
      node.key = key
  }
  const rows: KeyRowItem[] = []
  const walk = (level: Map<string, Node>, depth: number): void => {
    for (const node of [
      ...level.values(),
    ].sort((a, b) => a.label.localeCompare(b.label))) {
      const branch = node.children.size > 0
      const isOpen = all || open.has(node.id)
      rows.push({
        id: node.id,
        label: node.label,
        depth,
        key: node.key,
        branch,
        open: branch && isOpen,
      })
      if (branch && isOpen)
        walk(node.children, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

/** The folders that hold a key, outermost first. */
export function folderIds(key: string): string[] {
  return prefixes(key).slice(0, -1).map(p => p.id)
}

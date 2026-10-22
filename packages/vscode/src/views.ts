import type { TreeViewNode } from 'reactive-vscode'
import type { Event } from 'vscode'
import type { X18nClient } from './model/client'
import type { Item } from './model/tree'
import { ref, useActiveTextEditor, useDisposable, useTreeView, watch } from 'reactive-vscode'
import { Range, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri, workspace } from 'vscode'
import { flagIcon } from './flags'
import { commands } from './generated/meta'
import { projectFor } from './model/client'
import { fileItems, keyTree, progressItems, usageReportItems } from './model/tree'

interface ItemNode extends TreeViewNode {
  readonly item: Item
}

async function treeItem(item: Item): Promise<TreeItem> {
  const treeItem = new TreeItem(item.label, item.children ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None)
  if (item.description !== undefined)
    treeItem.description = item.description
  if (item.tooltip !== undefined)
    treeItem.tooltip = item.tooltip
  if (item.context !== undefined)
    treeItem.contextValue = item.context
  const flag = item.locale && await flagIcon(item.locale.code, item.locale.flag)
  if (flag)
    treeItem.iconPath = flag
  else if (item.icon)
    treeItem.iconPath = new ThemeIcon(item.icon, item.color === undefined ? undefined : new ThemeColor(item.color))
  if (item.location) {
    const { start, end } = item.location.range
    treeItem.command = { title: 'Open', command: 'vscode.open', arguments: [Uri.parse(item.location.uri), { selection: new Range(start.line, start.character, end.line, end.character) }] }
  }
  else if (item.openKey) {
    treeItem.command = { title: 'Open in UI', command: commands.openKey, arguments: [item.openKey] }
  }
  return treeItem
}

function toNode(item: Item): ItemNode {
  return {
    item,
    treeItem: treeItem(item),
    get children() {
      return item.children ? item.children().then(list => list.map(toNode), () => []) : []
    },
  }
}

/** Activity bar views. Each reloads its roots on `refresh`; Current File also on editor switch and edit. */
export function useViews(x18n: X18nClient, refresh: Event<void>): void {
  const revision = ref(0)
  useDisposable(refresh(() => revision.value++))
  const editor = useActiveTextEditor()
  const fileRevision = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  useDisposable(workspace.onDidChangeTextDocument(({ document }) => {
    if (document !== editor.value?.document)
      return
    clearTimeout(timer)
    timer = setTimeout(() => fileRevision.value++, 500)
  }))

  const roots = (load: () => Promise<Item[]>) => () => {
    void revision.value
    return load().then(items => items.map(toNode), () => [])
  }

  useTreeView('x18n.currentFile', () => {
    void revision.value
    void fileRevision.value
    const document = editor.value?.document
    if (!document || document.uri.scheme !== 'file')
      return []
    const uri = document.uri.toString()
    return Promise.all([x18n.request('x18n/fileKeys', { uri }), x18n.request('x18n/projects', undefined)])
      .then(([result, projects]) => fileItems(uri, projectFor(projects, document.uri.fsPath)?.name, result).map(toNode), () => [])
  })
  useTreeView('x18n.progress', roots(async () => {
    const [progress, projects] = await Promise.all([x18n.request('x18n/progress', undefined), x18n.request('x18n/projects', undefined)])
    return progressItems(progress, projects)
  }))
  useTreeView('x18n.keys', roots(() => keyTree(x18n)))
  useTreeView('x18n.usageReport', roots(async () => usageReportItems(await x18n.request('x18n/usageReport', undefined))))
  watch(editor, () => fileRevision.value++)
}

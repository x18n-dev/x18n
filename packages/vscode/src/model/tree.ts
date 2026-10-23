import type { FileKeysResult, Location, ProgressResult, ProjectInfo, Range, TreeNode, UsageReportResult } from '@x18n/lsp'
import type { KeyRef, X18nClient } from './client'

/** What a tree item shows and does, independent of the `vscode` API. */
export interface Item {
  readonly label: string
  readonly description?: string | undefined
  readonly tooltip?: string | undefined
  /** Codicon id. */
  readonly icon?: string | undefined
  /** Theme color id for the icon. */
  readonly color?: string | undefined
  /** Locale whose flag replaces the icon when `x18n.showFlags` is on. */
  readonly locale?: { readonly code: string, readonly flag: string | undefined } | undefined
  /** `x18n.key` for leaves, `x18n.prefix` for parents; drives the context menu. */
  readonly context?: 'x18n.key' | 'x18n.prefix' | undefined
  readonly ref?: KeyRef | undefined
  /** Revealed on click. */
  readonly location?: Location | undefined
  /** Opens the key in the UI on click. */
  readonly openKey?: KeyRef | undefined
  /** Lazy children; collapsible when present. */
  readonly children?: (() => Promise<Item[]>) | undefined
}

function percent(translated: number, total: number): string {
  return total === 0
    ? '100%'
    : `${Math.floor(translated / total * 100)}%`
}

function keyItem(node: TreeNode, project: string | undefined, client: X18nClient): Item {
  const ref = { project, key: node.key }
  if (node.leaf) {
    return {
      label: node.label,
      description: node.value ?? '(missing)',
      tooltip: node.key,
      icon: 'symbol-string',
      context: 'x18n.key',
      ref,
      openKey: ref,
    }
  }
  return {
    label: node.label,
    description: `${node.translated}/${node.total}`,
    tooltip: `${node.key} · ${percent(node.translated, node.total)} translated`,
    icon: 'symbol-namespace',
    context: 'x18n.prefix',
    ref,
    children: () => keyTree(client, project, node.key),
  }
}

/** Keys view, lazy by parent; one root per project when there are several. */
export async function keyTree(client: X18nClient, project?: string, parent?: string): Promise<Item[]> {
  if (project === undefined && parent === undefined) {
    const projects = await client.request('x18n/projects', undefined)
    if (projects.length > 1) {
      return projects.map(p => ({
        label: p.name,
        description: `${p.keys} keys`,
        icon: 'project',
        children: () => keyTree(client, p.name),
      }))
    }
  }
  const nodes = await client.request('x18n/tree', { project, parent })
  return nodes.map(node => keyItem(node, project, client))
}

function lineOf(range: Range): string {
  return `L${range.start.line + 1}`
}

/** Current File view, for the document at `uri` in `project`. */
export function fileItems(uri: string, project: string | undefined, result: FileKeysResult): Item[] {
  const keys = result.keys.map((k): Item => ({
    label: k.key,
    description: `${k.dynamic
      ? '(dynamic)'
      : k.missing
        ? '(missing)'
        : k.value ?? ''} · ${lineOf(k.range)}`,
    icon: k.dynamic
      ? 'symbol-variable'
      : k.missing ? 'warning' : 'symbol-string',
    color: k.missing ? 'list.warningForeground' : undefined,
    context: k.dynamic ? undefined : 'x18n.key',
    ref: k.dynamic
      ? undefined
      : { project, key: k.key },
    location: { uri, range: k.range },
  }))
  const hard = result.hardStrings.map((h): Item => ({
    label: h.text,
    description: `hard string · ${lineOf(h.range)}`,
    icon: 'quote',
    location: { uri, range: h.range },
  }))
  return [
    ...keys,
    ...hard,
  ]
}

function keyList(keys: readonly string[], project: string): Item[] {
  return keys.map(key => ({
    label: key,
    icon: 'symbol-string',
    context: 'x18n.key',
    ref: { project, key },
    openKey: { project, key },
  }))
}

/** Progress view: locales with coverage, expanding to missing and empty keys. `projects` gives the flags. */
export function progressItems(result: ProgressResult, projects: readonly ProjectInfo[]): Item[] {
  const locales = (project: ProgressResult['projects'][number]): Item[] => project.locales.map(l => ({
    label: l.locale,
    description: `${percent(l.translated, l.total)} · ${l.translated}/${l.total}`,
    icon: l.translated === l.total
      ? 'pass'
      : 'circle-large-outline',
    locale: { code: l.locale, flag: projects.find(p => p.name === project.name)?.locales.find(c => c.code === l.locale)?.flag },
    ...l.missing.length + l.empty.length > 0
      ? {
          children: async () => [
            ...l.missing.length
              ? [
                  {
                    label: 'Missing',
                    description: String(l.missing.length),
                    icon: 'warning',
                    children: async () => keyList(l.missing, project.name),
                  },
                ]
              : [],
            ...l.empty.length
              ? [
                  {
                    label: 'Empty',
                    description: String(l.empty.length),
                    icon: 'circle-slash',
                    children: async () => keyList(l.empty, project.name),
                  },
                ]
              : [],
          ],
        }
      : {},
  }))
  const [only, ...rest] = result.projects
  if (only && rest.length === 0)
    return locales(only)
  return result.projects.map(p => ({
    label: p.name,
    icon: 'project',
    children: async () => locales(p),
  }))
}

/** Usage Report view: unused keys and keys used but not defined. */
export function usageReportItems(result: UsageReportResult): Item[] {
  const unused = result.unused.map((u): Item => ({
    label: u.key,
    description: u.project,
    icon: 'symbol-string',
    context: 'x18n.key',
    ref: { project: u.project, key: u.key },
    location: u.location,
  }))
  const missing = result.missing.map((m): Item => ({
    label: m.key,
    description: `${m.locations.length} usage${m.locations.length === 1
      ? ''
      : 's'}`,
    icon: 'warning',
    color: 'list.warningForeground',
    location: m.locations[0],
    ...m.locations.length > 1
      ? {
          children: async () => m.locations.map(location => ({
            label: lineOf(location.range),
            description: location.uri,
            location,
          })),
        }
      : {},
  }))
  return [
    {
      label: 'Unused',
      description: String(unused.length),
      icon: 'circle-slash',
      children: async () => unused,
    },
    {
      label: 'Missing',
      description: String(missing.length),
      icon: 'warning',
      children: async () => missing,
    },
  ]
}

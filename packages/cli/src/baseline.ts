// Baseline after i18next-cli (MIT, https://github.com/i18next/i18next-cli), src/utils/lint-baseline.ts,
// and ESLint bulk suppressions.
import type { BaselineSummary, Diagnostic } from '@x18n/core'
import type { ProjectDefinition, Workspace } from '@x18n/node'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import * as v from 'valibot'
import { discoveredPath, physicalPath } from './physical-path'

/**
 * One known diagnostic and how often it occurs. It is identified by its reporting project, path, check, key, locale and message, not by
 * its line, so moving code keeps it in the baseline, while one more identical diagnostic in the same file is new.
 */
export interface BaselineEntry {
  /** Root for this row's paths, relative to the directory containing the baseline file. */
  readonly workspace?: string
  /** Present when the baseline records which project reported this diagnostic. */
  readonly project?: ProjectDefinition
  /** File relative to the workspace root, with `/`; the project directory for diagnostics without a location. */
  readonly path: string
  readonly code: string
  readonly key?: string | undefined
  readonly locale?: string | null | undefined
  readonly message: string
  readonly count: number
}

/** The file `x18n check --update-baseline` writes, by default `.x18n/check-baseline.json`. */
export interface Baseline {
  readonly diagnostics: readonly BaselineEntry[]
}

const BaselineSchema = v.object({
  diagnostics: v.array(v.object({
    workspace: v.exactOptional(v.string()),
    project: v.exactOptional(v.object({
      declaredIn: v.string(),
      directory: v.string(),
    })),
    path: v.string(),
    code: v.string(),
    // Older readers passed through optional key and locale values, including null.
    message: v.string(),
    count: v.pipe(v.number(), v.integer()),
  })),
})

/** A diagnostic with the path the baseline knows it by. */
export interface Located {
  readonly owner: ProjectDefinition
  readonly path: string
  readonly diagnostic: Diagnostic
}

type Identity = Pick<BaselineEntry, 'project' | 'path' | 'code' | 'key' | 'locale' | 'message'>

function identity({ owner, path, diagnostic: d }: Located): Identity {
  return {
    project: owner,
    path,
    code: d.code,
    key: d.key,
    locale: d.locale,
    message: d.message,
  }
}
function idOf(e: Identity, project: ProjectDefinition | null | undefined = e.project): string {
  return JSON.stringify([
    project?.declaredIn,
    project?.directory,
    e.path,
    e.code,
    e.key ?? null,
    e.locale ?? null,
    e.message,
  ])
}

// Plain code unit order, not `localeCompare`, so the file is the same on every machine.
function compare(a: string, b: string): number {
  return a < b
    ? -1
    : a > b
      ? 1
      : 0
}
function order(a: Identity, b: Identity): number {
  return compare(a.path, b.path) || compare(a.code, b.code)
    || compare(a.key ?? '', b.key ?? '') || compare(a.locale ?? '', b.locale ?? '') || compare(a.message, b.message)
    || compare(a.project?.declaredIn ?? '', b.project?.declaredIn ?? '') || compare(a.project?.directory ?? '', b.project?.directory ?? '')
}

/** The baseline that holds these diagnostics, sorted so that diffs stay small. */
export function createBaseline(located: readonly Located[]): Baseline {
  const entries = new Map<string, BaselineEntry>()
  for (const item of located) {
    const id = identity(item)
    const key = idOf(id)
    const entry = entries.get(key)
    entries.set(key, { ...id, count: (entry?.count ?? 0) + 1 })
  }
  return {
    diagnostics: [
      ...entries.values(),
    ].sort(order).map(e => ({
      ...e.project && { project: e.project },
      path: e.path,
      code: e.code,
      ...e.key !== undefined && { key: e.key },
      ...e.locale !== undefined && { locale: e.locale },
      message: e.message,
      count: e.count,
    })),
  }
}

/**
 * Leaves out the diagnostics the baseline holds, up to the count of each entry. `fixed` counts the entries that no
 * longer occur in the selected baseline.
 */
export function applyBaseline<T extends Located>(located: readonly T[], baseline: Baseline): { kept: T[] } & BaselineSummary {
  const left = new Map<string, number>()
  for (const entry of baseline.diagnostics) {
    const id = idOf(entry)
    left.set(id, (left.get(id) ?? 0) + entry.count)
  }
  let suppressed = 0
  const kept = located.filter((item) => {
    const e = identity(item)
    let id = idOf(e)
    // A full workspace can still match unowned rows from an older baseline.
    if (!left.get(id)) {
      id = idOf(e, null)
      // Older baselines also treated literal POSIX backslashes as separators.
      if (!left.get(id) && e.path.includes('\\')) {
        id = idOf({
          ...e,
          path: e.path.replaceAll('\\', '/'),
        }, null)
      }
    }
    const count = left.get(id) ?? 0
    if (count === 0)
      return true
    left.set(id, count - 1)
    suppressed++
    return false
  })
  let fixed = 0
  for (const count of left.values())
    fixed += count
  return { kept, suppressed, fixed }
}

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/') || '.'
}

function within(root: string, path: string): string | undefined {
  const suffix = relative(root, path)
  return suffix === '..' || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)
    ? undefined
    : suffix
}

/**
 * Map two spellings of the same workspace (or its ancestors) without collapsing
 * distinct project paths inside it, such as projects matched through different symlinks.
 */
function rebaseRows(from: string, to: string): (entry: BaselineEntry) => BaselineEntry {
  if (from === to)
    return entry => entry
  const ancestors = (root: string): string[] => {
    const paths = [root]
    for (let dir = root; dirname(dir) !== dir; dir = dirname(dir))
      paths.push(dirname(dir))
    return paths
  }
  const destinations = new Map(ancestors(to).map(dir => [
    physicalPath(dir),
    dir,
  ]))
  const aliases: [string, string][] = []
  for (const source of ancestors(from)) {
    const destination = destinations.get(physicalPath(source))
    if (destination === source)
      break
    if (destination)
      aliases.push([source, destination])
  }
  // An external alias can enter a subdirectory of the original workspace directly.
  if (within(from, to) === undefined && within(to, from) === undefined) {
    const enters = (start: string, root: string): [string, string] | undefined => {
      const physicalRoot = physicalPath(root)
      for (const dir of ancestors(start).reverse()) {
        const suffix = within(physicalRoot, physicalPath(dir))
        if (suffix !== undefined) {
          return [
            dir,
            resolve(root, suffix),
          ]
        }
      }
    }
    const fromAlias = enters(from, to)
    const toAlias = enters(to, from)
    if (fromAlias)
      aliases.unshift(fromAlias)
    else if (toAlias)
      aliases.unshift([toAlias[1], toAlias[0]])
  }
  const path = (value: string): string => {
    const absolute = resolve(from, value)
    for (const [source, destination] of aliases) {
      const inside = within(source, absolute)
      if (inside !== undefined)
        return relativePath(to, resolve(destination, inside))
    }
    return relativePath(to, absolute)
  }
  return entry => ({
    ...entry,
    ...entry.project && {
      project: {
        ...entry.project,
        declaredIn: path(entry.project.declaredIn),
        directory: path(entry.project.directory),
      },
    },
    path: path(entry.path),
  })
}

interface SavedRow {
  readonly stored: BaselineEntry
  readonly current: BaselineEntry
}

/** The baseline, or undefined when the file does not exist. A file that does not parse throws. */
async function readBaselineFile(file: string): Promise<Baseline | undefined> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return undefined
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {}
  if (v.is(BaselineSchema, value))
    return value
  throw new Error(`the check baseline ${file} is not valid. Run \`x18n check --update-baseline\` to write it again.`)
}

export async function readBaseline(file: string, workspace: Workspace, rebuild: boolean): Promise<SavedRow[] | undefined> {
  const baseline = await readBaselineFile(file).catch((error: unknown) => {
    if (!rebuild)
      throw error
    return undefined
  })
  if (!baseline)
    return undefined
  const directory = dirname(physicalPath(file))
  const roots = new Map<string, (entry: BaselineEntry) => BaselineEntry>()
  return baseline.diagnostics.map((stored) => {
    if (stored.workspace === undefined)
      return { stored, current: stored }
    let rebase = roots.get(stored.workspace)
    if (!rebase) {
      const savedRoot = resolve(directory, stored.workspace)
      rebase = rebaseRows(savedRoot, workspaceLocation(workspace, savedRoot))
      roots.set(stored.workspace, rebase)
    }
    return {
      stored,
      current: rebase(stored),
    }
  })
}

/**
 * Canonicalize the checkout prefix (including Windows short names), keeping any symlinks
 * named by the config's root option in the same positions as the project loader.
 */
function workspaceLocation({ root, configFile }: Workspace, savedRoot?: string): string {
  let prefix = configFile
    ? dirname(configFile)
    : root
  while (within(prefix, root) === undefined) {
    const parent = dirname(prefix)
    if (parent === prefix)
      return physicalPath(root)
    prefix = parent
  }
  const location = savedRoot === undefined
    ? physicalPath(prefix)
    : discoveredPath(savedRoot, prefix)
  return resolve(location, relative(prefix, root))
}

/**
 * An ignored package link names a member of its enclosing workspace. Save the member
 * relative to that workspace even when it is the first project to populate the shared file.
 */
function initialWorkspace(loaded: Workspace, directory: string): string {
  const member = workspaceLocation(loaded, directory)
  if (member === loaded.root)
    return workspaceLocation(loaded)
  let parent = loaded.root
  while (within(parent, member) === undefined && dirname(parent) !== parent)
    parent = dirname(parent)
  return parent
}

export async function writeBaseline(file: string, loaded: Workspace, baseline: Baseline, retained: readonly BaselineEntry[], previousWorkspace?: string): Promise<number> {
  await mkdir(dirname(file), { recursive: true })
  const directory = dirname(physicalPath(file))
  // The node loader resolves project definitions against its lexical root. A config root can be
  // a symlink: resolving ".." from its target would identify a different declaring directory.
  const workspace = previousWorkspace ?? relativePath(directory, initialWorkspace(loaded, directory))
  const savedRoot = resolve(directory, workspace)
  const rebase = rebaseRows(workspaceLocation(loaded, savedRoot), savedRoot)
  const diagnostics = [
    ...baseline.diagnostics.map(entry => ({
      workspace,
      ...rebase(entry),
    })),
    ...retained,
  ].sort(order)
  await writeFile(file, `${JSON.stringify({ diagnostics }, null, 2)}\n`)
  return diagnostics.reduce((sum, entry) => sum + entry.count, 0)
}

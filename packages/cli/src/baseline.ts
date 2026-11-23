// Baseline after i18next-cli (MIT, https://github.com/i18next/i18next-cli), src/utils/lint-baseline.ts,
// and ESLint bulk suppressions.
import type { BaselineSummary, Diagnostic } from '@x18n/core'
import type { ProjectDefinition } from '@x18n/node'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import * as v from 'valibot'

/**
 * One known diagnostic and how often it occurs. It is identified by its reporting project, path, check, key, locale and message, not by
 * its line, so moving code keeps it in the baseline, while one more identical diagnostic in the same file is new.
 */
export interface BaselineEntry {
  /** Present when the baseline records which project reported this diagnostic. */
  readonly project?: ProjectDefinition
  /** File relative to the workspace root, with `/`; the project directory for diagnostics without a location. */
  readonly path: string
  readonly code: string
  readonly key?: string | undefined
  readonly locale?: string | undefined
  readonly message: string
  readonly count: number
}

/** The file `x18n check --update-baseline` writes, by default `.x18n/check-baseline.json`. */
export interface Baseline {
  readonly diagnostics: readonly BaselineEntry[]
}

const BaselineSchema = v.object({
  diagnostics: v.array(v.object({
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
export function createBaseline(located: readonly Located[], kept: readonly BaselineEntry[] = []): Baseline {
  const entries = new Map<string, BaselineEntry>()
  for (const entry of kept)
    entries.set(idOf(entry), entry)
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

/** Keep entries outside this project check unchanged, including their occurrence counts. */
export function includeUnreportedEntries(selected: Baseline, outsideScope: readonly BaselineEntry[]): Baseline {
  return outsideScope.length
    ? {
        diagnostics: [
          ...selected.diagnostics,
          ...outsideScope,
        ].sort(order),
      }
    : selected
}

/**
 * Leaves out the diagnostics the baseline holds, up to the count of each entry. `fixed` counts the entries that no
 * longer occur; `relevant` limits it to the entries this run could have reported (see `--only`).
 */
export function applyBaseline<T extends Located>(located: readonly T[], baseline: Baseline, relevant: (entry: BaselineEntry) => boolean = () => true): { kept: T[] } & BaselineSummary {
  const left = new Map<string, number>()
  for (const entry of baseline.diagnostics) {
    if (relevant(entry)) {
      const id = idOf(entry)
      left.set(id, (left.get(id) ?? 0) + entry.count)
    }
  }
  let suppressed = 0
  const kept = located.filter((item) => {
    const e = identity(item)
    let id = idOf(e)
    // A full workspace can still match unowned rows from an older baseline.
    if (!left.get(id))
      id = idOf(e, null)
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

/** The baseline, or undefined when the file does not exist. A file that does not parse throws. */
export async function readBaseline(file: string): Promise<Baseline | undefined> {
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
  // Keep the original rows, including extra fields on entries outside a scoped refresh.
  if (v.is(BaselineSchema, value))
    return value
  throw new Error(`the check baseline ${file} is not valid. Run \`x18n check --update-baseline\` to write it again.`)
}

export async function writeBaseline(file: string, baseline: Baseline): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(baseline, null, 2)}\n`)
}

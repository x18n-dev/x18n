import type { BaselineSummary, Diagnostic, Reporter, ReportInput } from '@x18n/core'
import type { LoadedProject, Workspace } from '@x18n/node'
import type { Baseline, Located } from '../baseline'
import type { GlobalOptions } from '../context'
import { writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { errors } from '@x18n/core'
import { applyBaseline, createBaseline, readBaseline, writeBaseline } from '../baseline'
import { cwd, displayPath, openWorkspace, out, useColor } from '../context'

export interface CheckOptions extends GlobalOptions {
  readonly watch?: boolean | undefined
  readonly strict?: boolean | undefined
  readonly locale?: string | readonly string[] | undefined
  readonly only?: string | undefined
  readonly skip?: string | undefined
  readonly maxWarnings?: number | undefined
  readonly reporter?: string | readonly string[] | undefined
  readonly output?: string | readonly string[] | undefined
  readonly baseline?: string | undefined
  readonly updateBaseline?: boolean | undefined
}

function list(value: string | readonly string[] | undefined): string[] {
  return value === undefined
    ? []
    : [value].flat().flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean)
}

/** Whether this run reports a diagnostic (or a baseline entry), after `--locale`, `--only` and `--skip`. */
function reported(d: { readonly code: string, readonly locale?: string | undefined, readonly message: string }, options: CheckOptions): boolean {
  const locales = list(options.locale)
  const only = list(options.only)
  return (locales.length === 0 || d.locale === undefined || locales.includes(d.locale) || (d.code === 'missing-translation' && locales.some(l => d.message.includes(l))))
    && (only.length === 0 || only.includes(d.code))
    && !list(options.skip).includes(d.code)
}

function filterDiagnostics(diagnostics: readonly Diagnostic[], options: CheckOptions): Diagnostic[] {
  return diagnostics
    .filter(d => reported(d, options))
    .map(d => options.strict && d.severity === 'warning'
      ? { ...d, severity: 'error' as const }
      : d)
}

/** The reported diagnostics of every project, with the path the baseline knows each one by. */
function locate(workspace: Workspace, options: CheckOptions): (Located & { readonly project: LoadedProject })[] {
  return workspace.projects.flatMap((loaded) => {
    const posix = (path: string): string => relative(workspace.root, join(loaded.root, path)).replace(/\\/g, '/') || '.'
    return filterDiagnostics(loaded.project.analyze().diagnostics, options).map(diagnostic => ({
      project: loaded,
      path: posix(diagnostic.location?.path ?? ''),
      diagnostic,
    }))
  })
}

function reportInputs(workspace: Workspace, options: CheckOptions, baseline: Baseline | undefined): { inputs: ReportInput[], summary: BaselineSummary | undefined } {
  const located = locate(workspace, options)
  const applied = baseline && applyBaseline(located, baseline, entry => reported(entry, options))
  const kept = applied?.kept ?? located
  const inputs = workspace.projects.map((loaded: LoadedProject) => {
    const analysis = loaded.project.analyze()
    const diagnostics = kept.filter(item => item.project === loaded).map(item => item.diagnostic)
    return {
      project: loaded.name,
      text: (path: string) => loaded.project.text(path),
      diagnostics,
      coverage: analysis.coverage,
      summary: {
        errors: diagnostics.filter(d => d.severity === 'error').length,
        warnings: diagnostics.filter(d => d.severity === 'warning').length,
        infos: diagnostics.filter(d => d.severity === 'info' || d.severity === 'hint').length,
        files: new Set(diagnostics.flatMap(d => d.location
          ? [d.location.path]
          : [])).size,
      },
    }
  })
  return { inputs, summary: applied && { suppressed: applied.suppressed, fixed: applied.fixed } }
}

/** History costs a git walk, so it loads only when `stale-translation` runs. */
function needsHistory(loaded: LoadedProject, options: CheckOptions): boolean {
  const setting = loaded.project.config.checks['stale-translation']
  const level = typeof setting === 'string'
    ? setting
    : setting?.[0]
  const only = list(options.only)
  return level !== 'off' && (only.length === 0 || only.includes('stale-translation')) && !list(options.skip).includes('stale-translation')
}

async function report(workspace: Workspace, options: CheckOptions, baseline: Baseline | undefined): Promise<number> {
  const { inputs, summary } = reportInputs(workspace, options, baseline)
  const reporterIds = list(options.reporter)
  const ids = reporterIds.length
    ? reporterIds
    : [
        options.json ? 'json' : 'pretty',
      ]
  const outputs = list(options.output)
  const available: ReadonlyMap<string, Reporter> = workspace.projects[0]?.project.reporters ?? new Map()
  const roots = new Map(workspace.projects.map(p => [p.name, p.root]))
  for (const [i, id] of ids.entries()) {
    const reporter = available.get(id)
    if (!reporter) {
      throw errors.X18N0001({ issue: `unknown reporter "${id}" (${[
        ...available.keys(),
      ].join(', ')})` })
    }
    const text = await reporter.report(inputs, {
      color: !outputs[i] && useColor(options) && id === 'pretty',
      displayPath: (path, project) => displayPath(roots.get(project) ?? '', path),
      baseline: summary,
    })
    if (outputs[i])
      await writeFile(outputs[i]!, text)
    else if (text)
      process.stdout.write(text)
  }
  const errorCount = inputs.reduce((sum, input) => sum + input.summary.errors, 0)
  const warnings = inputs.reduce((sum, input) => sum + input.summary.warnings, 0)
  const tooManyWarnings = options.maxWarnings !== undefined && warnings > Number(options.maxWarnings)
  return errorCount > 0 || tooManyWarnings
    ? 1
    : 0
}

/** The baseline file: `--baseline <file>` from the cwd, else `.x18n/check-baseline.json` in the workspace root. */
function baselineFile(workspace: Workspace, options: CheckOptions): string {
  return options.baseline === undefined
    ? join(workspace.root, '.x18n', 'check-baseline.json')
    : resolve(cwd(), String(options.baseline))
}

/**
 * Writes the diagnostics this run reports into the baseline. Entries that `--only`, `--skip` or `--locale` leave
 * out stay as they are.
 */
async function updateBaseline(workspace: Workspace, options: CheckOptions, file: string, previous: Baseline | undefined): Promise<Baseline> {
  const baseline = createBaseline(locate(workspace, options), previous?.diagnostics.filter(entry => !reported(entry, options)))
  await writeBaseline(file, baseline)
  const count = baseline.diagnostics.reduce((sum, entry) => sum + entry.count, 0)
  process.stderr.write(`Wrote ${count} ${count === 1
    ? 'diagnostic'
    : 'diagnostics'} to the baseline ${relative(cwd(), file).replace(/\\/g, '/')}.\n`)
  return baseline
}

export async function check(options: CheckOptions): Promise<number> {
  const workspace = await openWorkspace(options)
  await Promise.all(workspace.projects.filter(loaded => needsHistory(loaded, options)).map(async (loaded) => {
    await loaded.project.loadHistory({ watch: options.watch })
    await loaded.host.flush()
  }))
  const file = baselineFile(workspace, options)
  // An invalid file is no reason to refuse writing a new one.
  let baseline = await readBaseline(file).catch((error: unknown) => {
    if (options.updateBaseline)
      return undefined
    throw error
  })
  if (options.updateBaseline)
    baseline = await updateBaseline(workspace, options, file, baseline)
  const code = await report(workspace, options, baseline)
  if (!options.watch)
    return code
  const rerun = async (): Promise<void> => {
    if (process.stdout.isTTY)
      process.stdout.write('\u001Bc')
    out(`[${new Date().toLocaleTimeString()}] File change detected. Checking...\n`)
    await report(workspace, options, baseline)
  }
  for (const loaded of workspace.projects) {
    loaded.project.watch()
    loaded.project.onChange(() => void rerun())
  }
  out('\nWatching for file changes.')
  return new Promise(() => {})
}

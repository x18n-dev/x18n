import type { BaselineSummary, Diagnostic, FixSummary, Reporter, ReportInput } from '@x18n/core'
import type { LoadedProject, LoadedWorkspace, Workspace } from '@x18n/node'
import type { Baseline, BaselineEntry, Located } from '../baseline'
import type { GlobalOptions } from '../context'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { errors } from '@x18n/core'
import { applyBaseline, createBaseline, readBaseline, writeBaseline } from '../baseline'
import { answer, cwd, displayPath, formatPlan, openWorkspace, out, useColor } from '../context'
import { physicalPath } from '../physical-path'

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
  /** `--fix` applies safe fixes, `--fix=unsafe` also unsafe ones. */
  readonly fix?: boolean | string | undefined
  readonly dryRun?: boolean | undefined
}

function list(value: string | readonly string[] | undefined): string[] {
  return value === undefined
    ? []
    : [value].flat().flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean)
}

// `missing-translation` reports one diagnostic per key at the source locale and names the target locales only in its
// message (`"<key>" is missing in de, pt-BR.`). Baseline entries keep no fixes, so the message is all both paths have.
function missingLocales(message: string): string[] {
  const marker = ' is missing in '
  const at = message.lastIndexOf(marker)
  return at === -1
    ? []
    : message.slice(at + marker.length).replace(/\.$/, '').split(', ')
}

/** Whether this run reports a diagnostic (or a baseline entry), after `--locale`, `--only` and `--skip`. */
function reported(d: Pick<BaselineEntry, 'code' | 'locale' | 'message'>, options: CheckOptions): boolean {
  const locales = list(options.locale)
  const only = list(options.only)
  return (locales.length === 0 || d.locale == null || locales.includes(d.locale) || (d.code === 'missing-translation' && missingLocales(d.message).some(l => locales.includes(l))))
    && (only.length === 0 || only.includes(d.code))
    && !list(options.skip).includes(d.code)
}

/** Tests a workspace-relative path against the physical files selected on the command line. */
type Scope = ((path: string) => boolean) | undefined

function scopeOf(workspace: Workspace, files: readonly string[]): Scope {
  if (files.length === 0)
    return undefined
  const paths = new Set(files.map(file => physicalPath(resolve(cwd(), file))))
  // The baseline stores diagnostics without a location under their project's effective root.
  for (const loaded of workspace.projects)
    paths.add(physicalPath(loaded.root))
  return path => paths.has(physicalPath(resolve(workspace.root, path)))
}

/** A diagnostic without a location stays: no file holds it. */
function inScope(scope: Scope, path: string | undefined): boolean {
  return scope === undefined || path === undefined || scope(path)
}

function reportsEntry(entry: BaselineEntry, options: CheckOptions, scope: Scope): boolean {
  return reported(entry, options) && inScope(scope, entry.path)
}

/** The path of a diagnostic, posix and relative to the workspace root; `undefined` when it has no location. */
function pathOf(workspace: Workspace, loaded: LoadedProject, path: string | undefined): string | undefined {
  return path === undefined
    ? undefined
    : relative(workspace.root, join(loaded.root, path)).replace(/\\/g, '/') || '.'
}

function filterDiagnostics(diagnostics: readonly Diagnostic[], options: CheckOptions, inFiles: (diagnostic: Diagnostic) => boolean = () => true): Diagnostic[] {
  return diagnostics
    .filter(d => reported(d, options) && inFiles(d))
    .map(d => options.strict && d.severity === 'warning'
      ? { ...d, severity: 'error' as const }
      : d)
}

/** The reported diagnostics of every project, with the path the baseline knows each one by. */
function locate(workspace: LoadedWorkspace, options: CheckOptions, scope: Scope): (Located & { readonly project: LoadedProject })[] {
  return workspace.projects.flatMap((loaded) => {
    return filterDiagnostics(loaded.project.analyze().diagnostics, options, d => inScope(scope, pathOf(workspace, loaded, d.location?.path))).map(diagnostic => ({
      project: loaded,
      owner: loaded.definition,
      path: pathOf(workspace, loaded, diagnostic.location?.path ?? '') ?? '.',
      diagnostic,
    }))
  })
}

type Fixes = ReadonlyMap<LoadedProject, FixSummary>

function reportInputs(workspace: LoadedWorkspace, options: CheckOptions, scope: Scope, baseline: Baseline | undefined, fixes?: Fixes): { inputs: ReportInput[], summary: BaselineSummary | undefined } {
  const located = locate(workspace, options, scope)
  const applied = baseline && applyBaseline(located, baseline)
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
      fix: fixes?.get(loaded),
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

async function report(workspace: LoadedWorkspace, options: CheckOptions, scope: Scope, baseline: Baseline | undefined, fixes?: Fixes): Promise<number> {
  const { inputs, summary } = reportInputs(workspace, options, scope, baseline, fixes)
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

/** Preserve the configuration discovery context and baseline file when dropping the project selector. */
function migrationHint(workspace: LoadedWorkspace, options: CheckOptions): string {
  const where = cwd() === workspace.root
    ? 'the workspace root'
    : 'the same directory as this check'
  const scopeHint = 'If this check loads only part of the original workspace, return to the directory and workspace options that created this baseline. Review a full check there using the same baseline file, then repeat it with `--update-baseline`. Use the following steps only for the full workspace.'
  let command = 'x18n check'
  for (const flag of ['root', 'config', 'baseline'] as const) {
    if (options[flag] === undefined)
      continue
    const path = String(options[flag])
    // The caller's shell knows how to quote its paths. CAC also treats bare numbers and leading dashes specially.
    if (!/^[\w./-]+$/.test(path) || path.startsWith('-') || Number.isFinite(Number(path)))
      return `${scopeHint} From ${where}, run \`x18n check\` with only the --root, --config and --baseline arguments you originally supplied. Copy those arguments with their original quoting. Review the result, then add \`--update-baseline\` to that command and run it once.`
    command += ` --${flag} ${path}`
  }
  return `${scopeHint} From ${where}, run \`${command}\` to review the workspace check, then \`${command} --update-baseline\` once.`
}

/** A relative legacy path can name a selected file through a different root or a symlink. */
function legacyPathInScope(entry: BaselineEntry, scope: Scope): boolean {
  return (entry.workspace === undefined && !isAbsolute(entry.path)) || inScope(scope, entry.path)
}

interface BaselineSelection {
  readonly selected: Baseline
  readonly retained: readonly BaselineEntry[]
  readonly workspace: string | undefined
}

async function selectBaseline(workspace: LoadedWorkspace, options: CheckOptions, scope: Scope, file: string): Promise<BaselineSelection | undefined> {
  const rows = await readBaseline(file, workspace.root, options.project === undefined && !!options.updateBaseline)
  if (!rows)
    return undefined
  const selected: BaselineEntry[] = []
  const retained: BaselineEntry[] = []
  for (const { stored, current } of rows) {
    if (options.project !== undefined && (!current.project || stored.workspace === undefined)
      && current.count !== 0 && reported(current, options) && legacyPathInScope(current, scope)) {
      throw new Error(`The baseline does not identify the project and workspace that reported "${stored.path}". ${migrationHint(workspace, options)}`)
    }
    const owner = current.project
    const matches = options.project === undefined || (stored.workspace !== undefined && owner
      && workspace.projects.some(({ definition }) => definition.declaredIn === owner.declaredIn && definition.directory === owner.directory))
    if (matches && reportsEntry(current, options, scope))
      selected.push(current)
    else
      retained.push(stored)
  }
  return {
    selected: { diagnostics: selected },
    retained,
    workspace: rows.find(row => row.stored.project && row.stored.workspace !== undefined)?.stored.workspace,
  }
}

/** Refresh the reported diagnostics and keep the original rows outside this run. */
async function updateBaseline(workspace: LoadedWorkspace, options: CheckOptions, scope: Scope, file: string, selection: BaselineSelection | undefined): Promise<Baseline> {
  const baseline = createBaseline(locate(workspace, options, scope))
  const count = await writeBaseline(file, workspace.root, baseline, selection?.retained ?? [], selection?.workspace)
  process.stderr.write(`Wrote ${count} ${count === 1
    ? 'diagnostic'
    : 'diagnostics'} to the baseline ${relative(cwd(), file).replace(/\\/g, '/')}.\n`)
  return baseline
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1
    ? ''
    : 's'}`
}

/** `--fix` or `--fix=unsafe`; anything else is refused before the workspace loads. */
function fixLevel(options: CheckOptions): 'safe' | 'unsafe' | undefined {
  if (options.fix === undefined || options.fix === false) {
    if (options.dryRun)
      throw errors.X18N4008({ reason: '--dry-run previews fixes; pass it with --fix' })
    return undefined
  }
  if (options.fix !== true && options.fix !== 'unsafe')
    throw errors.X18N4008({ reason: `--fix takes no value or "unsafe", not "${String(options.fix)}"` })
  if (options.watch)
    throw errors.X18N4008({ reason: '--fix writes once; leave out --watch' })
  return options.fix === true
    ? 'safe'
    : 'unsafe'
}

/**
 * Plans the fixes of the diagnostics this run reports (after `--locale`, `--only` and `--skip`, before the baseline) and
 * applies them, or prints them with `--dry-run`. The summary goes to stderr, so stdout keeps only the report.
 */
async function fix(workspace: Workspace, options: CheckOptions, scope: Scope, level: 'safe' | 'unsafe'): Promise<Fixes> {
  const fixes = new Map<LoadedProject, FixSummary>()
  for (const loaded of workspace.projects) {
    const diagnostics = filterDiagnostics(loaded.project.analyze().diagnostics, options, d => inScope(scope, pathOf(workspace, loaded, d.location?.path)))
    const { plan, fixed, skipped } = loaded.project.planFixes(diagnostics, {
      unsafe: level === 'unsafe',
    })
    const files = plan.changes.map(change => change.path)
    if (!options.dryRun && plan.changes.length > 0)
      await loaded.project.apply(plan, { answers: await answer(plan, options) })
    fixes.set(loaded, {
      applied: !options.dryRun,
      fixed: fixed.length,
      skipped: skipped.length,
      files,
      warnings: plan.warnings,
    })
    if (options.json)
      continue
    const lines: string[] = []
    if (options.dryRun && plan.changes.length > 0)
      lines.push(formatPlan(loaded.project, loaded.root, plan))
    else
      lines.push(...plan.warnings.map(w => `warning: ${w}`))
    const prefix = workspace.projects.length > 1
      ? `${loaded.name}: `
      : ''
    const count = `${plural(fixed.length, 'problem')} in ${plural(files.length, 'file')}`
    lines.push(`${prefix}${fixed.length === 0
      ? 'No problems to fix.'
      : options.dryRun
        ? `Would fix ${count} (dry run).`
        : `Fixed ${count}.`}`)
    if (skipped.length > 0) {
      lines.push(`${prefix}${plural(skipped.length, 'problem')} only ${skipped.length === 1
        ? 'has'
        : 'have'} an unsafe fix; run with --fix=unsafe to apply ${skipped.length === 1
        ? 'it'
        : 'them'}.`)
    }
    process.stderr.write(`${lines.join('\n')}\n`)
  }
  return fixes
}

export async function check(files: readonly string[], options: CheckOptions): Promise<number> {
  const level = fixLevel(options)
  const workspace = await openWorkspace(options)
  if (options.project !== undefined && workspace.projects.length > 1) {
    const matches = workspace.projects.map(({ definition }) => `${definition.directory} (declared in ${definition.declaredIn})`)
    const directories = new Set(workspace.projects.map(({ definition }) => definition.directory))
    const hint = directories.size === matches.length
      ? 'Give projects in different directories distinct names.'
      : 'If the shared baseline contains entries without a project, migrate it in the original workspace before selecting a config. Review the full check there, then repeat it with `--update-baseline`. Run `x18n status --config <file>` for one declaring config. Use the listed name with --project and that same --config.'
    throw errors.X18N0001({ issue: `--project "${options.project}" matches multiple projects: ${matches.join(', ')}. ${hint}` })
  }
  const scope = scopeOf(workspace, files)
  await Promise.all(workspace.projects.filter(loaded => needsHistory(loaded, options)).map(async (loaded) => {
    await loaded.project.loadHistory({ watch: options.watch })
    await loaded.host.flush()
  }))
  const file = baselineFile(workspace, options)
  // Check ownership before --fix can edit a resource in a project-scoped run.
  const scoped = options.project === undefined
    ? undefined
    : await selectBaseline(workspace, options, scope, file).catch((error: unknown) => {
        // History watchers can keep the CLI alive after it reports the migration error.
        for (const { project } of workspace.projects)
          project.dispose()
        throw error
      })
  const fixes = level && await fix(workspace, options, scope, level)
  const selection = options.project !== undefined
    ? scoped
    : await selectBaseline(workspace, options, scope, file)
  const baseline = options.updateBaseline
    ? await updateBaseline(workspace, options, scope, file, selection)
    : selection?.selected
  const code = await report(workspace, options, scope, baseline, fixes)
  if (!options.watch)
    return code
  const rerun = async (): Promise<void> => {
    if (process.stdout.isTTY)
      process.stdout.write('\u001Bc')
    out(`[${new Date().toLocaleTimeString()}] File change detected. Checking...\n`)
    await report(workspace, options, scope, baseline)
  }
  for (const loaded of workspace.projects) {
    loaded.project.watch()
    loaded.project.onChange(() => void rerun())
  }
  out('\nWatching for file changes.')
  return new Promise(() => {})
}

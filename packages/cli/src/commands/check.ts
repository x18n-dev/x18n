import type { Diagnostic, Reporter, ReportInput } from '@x18n/core'
import type { LoadedProject, Workspace } from '@x18n/node'
import type { GlobalOptions } from '../context'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { X18nError } from '@x18n/core'
import { displayPath, openWorkspace, out, useColor } from '../context'

export interface CheckOptions extends GlobalOptions {
  readonly watch?: boolean | undefined
  readonly strict?: boolean | undefined
  readonly locale?: string | readonly string[] | undefined
  readonly only?: string | undefined
  readonly skip?: string | undefined
  readonly maxWarnings?: number | undefined
  readonly reporter?: string | readonly string[] | undefined
  readonly output?: string | readonly string[] | undefined
}

function list(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : [value].flat().flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean)
}

function filterDiagnostics(diagnostics: readonly Diagnostic[], options: CheckOptions): Diagnostic[] {
  const locales = list(options.locale)
  const only = list(options.only)
  const skip = list(options.skip)
  return diagnostics
    .filter(d => locales.length === 0 || d.locale === undefined || locales.includes(d.locale) || (d.code === 'missing-translation' && locales.some(l => d.message.includes(l))))
    .filter(d => only.length === 0 || only.includes(d.code))
    .filter(d => !skip.includes(d.code))
    .map(d => options.strict && d.severity === 'warning' ? { ...d, severity: 'error' as const } : d)
}

function reportInputs(workspace: Workspace, options: CheckOptions): ReportInput[] {
  return workspace.projects.map((loaded: LoadedProject) => {
    const analysis = loaded.project.analyze()
    const diagnostics = filterDiagnostics(analysis.diagnostics, options)
    return {
      project: loaded.name,
      text: (path: string) => loaded.project.text(path),
      diagnostics,
      coverage: analysis.coverage,
      summary: {
        errors: diagnostics.filter(d => d.severity === 'error').length,
        warnings: diagnostics.filter(d => d.severity === 'warning').length,
        infos: diagnostics.filter(d => d.severity === 'info' || d.severity === 'hint').length,
        files: new Set(diagnostics.flatMap(d => d.location ? [d.location.path] : [])).size,
      },
    }
  })
}

/** History costs a git walk, so it loads only when `stale-translation` runs. */
function needsHistory(loaded: LoadedProject, options: CheckOptions): boolean {
  const setting = loaded.project.config.checks['stale-translation']
  const level = typeof setting === 'string' ? setting : setting?.[0]
  const only = list(options.only)
  return level !== 'off' && (only.length === 0 || only.includes('stale-translation')) && !list(options.skip).includes('stale-translation')
}

async function report(workspace: Workspace, options: CheckOptions): Promise<number> {
  const inputs = reportInputs(workspace, options)
  const reporterIds = list(options.reporter)
  const ids = reporterIds.length ? reporterIds : [options.json ? 'json' : 'pretty']
  const outputs = list(options.output)
  const available: ReadonlyMap<string, Reporter> = workspace.projects[0]?.project.reporters ?? new Map()
  const roots = new Map(workspace.projects.map(p => [p.name, p.root]))
  for (const [i, id] of ids.entries()) {
    const reporter = available.get(id)
    if (!reporter)
      throw new X18nError('X18N0001', `unknown reporter "${id}" (${[...available.keys()].join(', ')})`)
    const text = await reporter.report(inputs, {
      color: !outputs[i] && useColor(options) && id === 'pretty',
      displayPath: (path, project) => displayPath(roots.get(project) ?? '', path),
    })
    if (outputs[i])
      await writeFile(outputs[i]!, text)
    else if (text)
      process.stdout.write(text)
  }
  const errors = inputs.reduce((sum, input) => sum + input.summary.errors, 0)
  const warnings = inputs.reduce((sum, input) => sum + input.summary.warnings, 0)
  const tooManyWarnings = options.maxWarnings !== undefined && warnings > Number(options.maxWarnings)
  return errors > 0 || tooManyWarnings ? 1 : 0
}

export async function check(options: CheckOptions): Promise<number> {
  const workspace = await openWorkspace(options)
  await Promise.all(workspace.projects.filter(loaded => needsHistory(loaded, options)).map(async (loaded) => {
    await loaded.project.loadHistory({ watch: options.watch })
    await loaded.host.flush()
  }))
  const code = await report(workspace, options)
  if (!options.watch)
    return code
  const rerun = async (): Promise<void> => {
    if (process.stdout.isTTY)
      process.stdout.write('\u001Bc')
    out(`[${new Date().toLocaleTimeString()}] File change detected. Checking...\n`)
    await report(workspace, options)
  }
  for (const loaded of workspace.projects) {
    loaded.project.watch()
    loaded.project.onChange(() => void rerun())
  }
  out('\nWatching for file changes.')
  return new Promise(() => {})
}

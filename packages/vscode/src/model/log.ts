import type { ProgressResult, ProjectInfo } from '@x18n/lsp'

/** `[12:03:41] message`, one line per entry in the output channel. */
export function stamp(message: string, now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}] ${message}`
}

function percent(translated: number, total: number): string {
  return `${total === 0
    ? 100
    : Math.floor((translated / total) * 100)}%`.padStart(4)
}

/** The projects the server loaded and how translated each locale is, as indented lines. */
export function formatStatus(projects: readonly ProjectInfo[], progress: ProgressResult): string[] {
  if (projects.length === 0)
    return ['No x18n project found in the workspace. Run `x18n: Explain Projects` to see why, then `x18n init` or add an x18n.config.ts.']
  const lines = [`${projects.length} project${projects.length === 1
    ? ''
    : 's'} loaded`]
  for (const project of projects) {
    lines.push(`  ${project.name}  ${project.root}`, `    ${project.keys} keys, source ${project.sourceLocale}, display ${project.displayLocale}`)
    if (project.keys === 0)
      lines.push('    Run `x18n: Explain Projects` to see why no keys were found.')
    const locales = progress.projects.find(p => p.name === project.name)?.locales ?? []
    const width = Math.max(0, ...locales.map(l => l.locale.length))
    for (const l of locales) {
      const gaps = l.missing.length + l.empty.length
      lines.push(`    ${l.locale.padEnd(width)} ${percent(l.translated, l.total)} ${l.translated}/${l.total}${gaps
        ? `  (${l.missing.length} missing, ${l.empty.length} empty)`
        : ''}`)
    }
  }
  return lines
}

import type { ProjectExplanation } from '../types/project'

/** `project.explain()` as the text `x18n doctor` prints. `root` and `configFile` are shown as given. */
export function renderExplanation(e: ProjectExplanation, configFile?: string | undefined): string {
  const lines = [
    `# ${e.name} (${e.root})`,
    `config: ${configFile ?? 'none (detection only)'}`,
    'presets:',
  ]
  const applied = e.presets.filter(p => p.reason === 'detected' || p.reason === 'listed')
  lines.push(...applied.map(p => `  ✓ ${p.name} (${p.reason})`))
  if (applied.length === 0)
    lines.push('  none')
  if (e.presets.length > applied.length)
    lines.push(`  ${e.presets.length - applied.length} others not applied`)
  lines.push('finders:')
  for (const f of e.finders)
    lines.push(`  ${f.id}: ${f.resources.length} resources`, ...f.resources.slice(0, 20).map(path => `    ${path}`))
  lines.push('formats:', ...e.formats.filter(f => f.resources > 0).map(f => `  ${f.id} (${f.extensions.join(', ')}): ${f.resources} resources`))
  lines.push('scanners:', ...e.scanners.map(s => `  ${s.id} (${s.extensions.join(', ') || 'none'}): ${s.files} files`))
  if (e.conflicts.length)
    lines.push('conflicts:', ...e.conflicts.map(c => `  .${c.extension}: ${c.winner} wins over ${c.loser}`))
  if (e.errors.length)
    lines.push('errors:', ...e.errors.map(err => `  ${err.name} ${err.why}`))
  lines.push('config origins:', ...Object.entries(e.config.origins).map(([key, origin]) => `  ${key}: ${origin}`))
  return lines.join('\n')
}

import type { Reporter } from '@x18n/core'
import { createLineIndex } from '@x18n/core'
import { plural, totals } from './shared'

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Summary and tables for PR comments and agent context. */
export const markdownReporter: Reporter = {
  id: 'markdown',
  report(inputs, ctx) {
    const sum = totals(inputs)
    const out = [
      '## x18n check',
      '',
      `**${plural(sum.errors, 'error')}**, ${plural(sum.warnings, 'warning')} in ${plural(sum.files, 'file')}.`,
      '',
    ]
    for (const input of inputs) {
      if (inputs.length > 1)
        out.push(`### ${input.project}`, '')
      out.push('| Locale | Translated | Missing | Empty |', '| --- | --- | --- | --- |')
      for (const c of input.coverage)
        out.push(`| ${c.locale} | ${c.translated}/${c.total} | ${c.missing.length} | ${c.empty.length} |`)
      out.push('')
      if (input.diagnostics.length === 0)
        continue
      out.push('| Severity | Check | Location | Message |', '| --- | --- | --- | --- |')
      for (const d of input.diagnostics.slice(0, 200)) {
        const line = d.location
          ? createLineIndex(input.text(d.location.path) ?? '').position(d.location.range.start).line + 1
          : undefined
        const where = d.location
          ? `\`${ctx.displayPath(d.location.path, input.project)}:${line}\``
          : ''
        out.push(`| ${d.severity} | \`${d.code}\` | ${where} | ${escapeCell(d.message)} |`)
      }
      if (input.diagnostics.length > 200)
        out.push('', `_${input.diagnostics.length - 200} more not shown._`)
      out.push('')
    }
    return `${out.join('\n')}\n`
  },
}

export default markdownReporter

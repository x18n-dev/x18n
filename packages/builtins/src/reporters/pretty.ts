import type { Diagnostic, Reporter, ReporterContext } from '@x18n/core'
import type { Color } from './shared'
import { createLineIndex } from '@x18n/core'
import { codes, paint, plural, totals } from './shared'

const severityColor: Record<Diagnostic['severity'], Color> = {
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  hint: 'gray',
}

/** The severity as a highlighted label, like ` ERROR `. */
function badge(ctx: ReporterContext, severity: Diagnostic['severity']): string {
  const label = ` ${severity.toUpperCase()} `
  return ctx.color
    ? `\u001B[1;7;${codes[severityColor[severity]]}m${label}\u001B[0m`
    : label
}

/** The marked line with one line of context on each side, and `~` under the range. */
function codeFrame(text: string, start: number, end: number, severity: Diagnostic['severity'], ctx: ReporterContext): string {
  const index = createLineIndex(text)
  const from = index.position(start)
  const to = index.position(end)
  const first = Math.max(0, from.line - 1)
  const last = Math.min(index.lineCount - 1, from.line + 1)
  const pad = String(last + 1).length
  const gutter = (n: string): string => `${paint(ctx, 'gray', n.padStart(pad))} ${paint(ctx, 'gray', '│')} `
  const width = Math.max(1, (to.line === from.line
    ? to.character
    : index.line(from.line).length) - from.character)
  const lines: string[] = []
  for (let n = first; n <= last; n++) {
    const line = index.line(n)
    lines.push(`${gutter(String(n + 1))}${n === from.line
      ? line
      : paint(ctx, 'gray', line)}`)
    if (n === from.line)
      lines.push(`${gutter('')}${' '.repeat(from.character)}${paint(ctx, severityColor[severity], '~'.repeat(width))}`)
  }
  return lines.join('\n')
}

/** `path:line:col`, then the severity, message and check, a code frame, and a summary. */
export const prettyReporter: Reporter = {
  id: 'pretty',
  report(inputs, ctx) {
    const blocks: string[] = []
    for (const input of inputs) {
      for (const d of input.diagnostics) {
        const head = `${badge(ctx, d.severity)} ${d.message}  ${paint(ctx, 'gray', d.code)}`
        if (!d.location) {
          blocks.push(head)
          continue
        }
        const text = input.text(d.location.path)
        const position = createLineIndex(text ?? '').position(d.location.range.start)
        const where = `${paint(ctx, 'cyan', ctx.displayPath(d.location.path, input.project))}${paint(ctx, 'gray', `:${position.line + 1}:${position.character + 1}`)}`
        const frame = text !== undefined && d.location.range.end > d.location.range.start
          ? `\n${codeFrame(text, d.location.range.start, d.location.range.end, d.severity, ctx)}`
          : ''
        blocks.push(`${where}\n${head}${frame}`)
      }
    }
    const sum = totals(inputs)
    if (sum.errors + sum.warnings === 0) {
      blocks.push(paint(ctx, 'gray', 'Found no errors.'))
    }
    else {
      const parts = [
        sum.errors
          ? paint(ctx, 'red', `✖ ${plural(sum.errors, 'error')}`)
          : '',
        sum.warnings
          ? paint(ctx, 'yellow', `⚠ ${plural(sum.warnings, 'warning')}`)
          : '',
        paint(ctx, 'gray', plural(sum.files, 'file')),
      ].filter(Boolean)
      blocks.push(parts.join('  '))
    }
    if (ctx.baseline?.suppressed)
      blocks.push(paint(ctx, 'gray', `The baseline left out ${plural(ctx.baseline.suppressed, 'known diagnostic')}.`))
    if (ctx.baseline?.fixed)
      blocks.push(paint(ctx, 'gray', `Fixed since the baseline: ${ctx.baseline.fixed}. Run \`x18n check --update-baseline\` to drop them from it.`))
    return `${blocks.join('\n\n')}\n`
  },
}

export default prettyReporter

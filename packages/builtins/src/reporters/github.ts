import type { Reporter } from '@x18n/core'
import { toWireDiagnostic } from '@x18n/core'

function escapeProperty(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C')
}

function escapeData(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/** GitHub Actions workflow commands, which become annotations on the PR. */
export const githubReporter: Reporter = {
  id: 'github',
  report(inputs, ctx) {
    const out: string[] = []
    for (const input of inputs) {
      for (const d of input.diagnostics) {
        const level = d.severity === 'error'
          ? 'error'
          : d.severity === 'warning'
            ? 'warning'
            : 'notice'
        const props = [`title=${escapeProperty(`x18n ${d.code}`)}`]
        if (d.location) {
          const wire = toWireDiagnostic(input.project, d, input.text).range!
          props.unshift(`file=${escapeProperty(ctx.displayPath(d.location.path, input.project))}`, `line=${wire.line}`, `col=${wire.column}`, `endLine=${wire.endLine}`, `endColumn=${wire.endColumn}`)
        }
        out.push(`::${level} ${props.join(',')}::${escapeData(d.message)}`)
      }
    }
    return out.length
      ? `${out.join('\n')}\n`
      : ''
  },
}

export default githubReporter

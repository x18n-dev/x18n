import type { Diagnostic, Plugin, Reporter, ReporterContext, ReportInput, ReportSummary } from '@x18n/core'
import { createLineIndex, envelope, toWireDiagnostic } from '@x18n/core'

const codes = { red: 31, yellow: 33, cyan: 36, gray: 90, blue: 34, bold: 1 } as const
type Color = keyof typeof codes

function paint(ctx: ReporterContext, color: Color, text: string): string {
  return ctx.color ? `\u001B[${codes[color]}m${text}\u001B[0m` : text
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function totals(inputs: readonly ReportInput[]): ReportSummary {
  return inputs.reduce((sum, input) => ({
    errors: sum.errors + input.summary.errors,
    warnings: sum.warnings + input.summary.warnings,
    infos: sum.infos + input.summary.infos,
    files: sum.files + input.summary.files,
  }), { errors: 0, warnings: 0, infos: 0, files: 0 })
}

const severityColor: Record<Diagnostic['severity'], Color> = { error: 'red', warning: 'yellow', info: 'blue', hint: 'gray' }

function codeFrame(text: string, start: number, end: number, ctx: ReporterContext): string {
  const index = createLineIndex(text)
  const from = index.position(start)
  const to = index.position(end)
  const number = String(from.line + 1)
  const line = index.line(from.line)
  const width = Math.max(1, (to.line === from.line ? to.character : line.length) - from.character)
  const gutter = ' '.repeat(number.length)
  return `${paint(ctx, 'gray', number)} ${line}\n${gutter} ${' '.repeat(from.character)}${paint(ctx, 'red', '~'.repeat(width))}`
}

/** tsc-style output: `path:line:col - error code: message`, code frames, then a summary. */
export const prettyReporter: Reporter = {
  id: 'pretty',
  report(inputs, ctx) {
    const out: string[] = []
    for (const input of inputs) {
      for (const d of input.diagnostics) {
        const head = `${paint(ctx, severityColor[d.severity], d.severity)} ${paint(ctx, 'gray', d.code)}: ${d.message}`
        if (!d.location) {
          out.push(`${head}\n`)
          continue
        }
        const text = input.text(d.location.path)
        const position = createLineIndex(text ?? '').position(d.location.range.start)
        const where = `${paint(ctx, 'cyan', ctx.displayPath(d.location.path, input.project))}:${paint(ctx, 'yellow', String(position.line + 1))}:${paint(ctx, 'yellow', String(position.character + 1))}`
        const frame = text !== undefined && d.location.range.end > d.location.range.start
          ? `\n${codeFrame(text, d.location.range.start, d.location.range.end, ctx)}\n`
          : ''
        out.push(`${where} - ${head}${frame}`)
      }
    }
    const sum = totals(inputs)
    if (sum.errors + sum.warnings === 0) {
      out.push(paint(ctx, 'gray', 'Found no errors.'))
    }
    else {
      const parts = [sum.errors ? plural(sum.errors, 'error') : '', sum.warnings ? plural(sum.warnings, 'warning') : ''].filter(Boolean)
      out.push(`${out.length && !out.at(-1)!.endsWith('\n') ? '\n' : ''}Found ${parts.join(' and ')} in ${plural(sum.files, 'file')}.`)
    }
    return `${out.join('\n')}\n`
  },
}

/** The versioned JSON contract of `x18n check --json`. */
export const jsonReporter: Reporter = {
  id: 'json',
  report(inputs) {
    const diagnostics = inputs.flatMap(input => input.diagnostics.map(d => toWireDiagnostic(input.project, d, input.text)))
    const data = { projects: inputs.map(input => ({ name: input.project, summary: input.summary, coverage: input.coverage.map(c => ({ locale: c.locale, total: c.total, translated: c.translated, missing: c.missing.length, empty: c.empty.length, outdated: c.outdated.length })) })) }
    return `${JSON.stringify(envelope('check', data, diagnostics), null, 2)}\n`
  },
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Summary and tables for PR comments and agent context. */
export const markdownReporter: Reporter = {
  id: 'markdown',
  report(inputs, ctx) {
    const sum = totals(inputs)
    const out = ['## x18n check', '', `**${plural(sum.errors, 'error')}**, ${plural(sum.warnings, 'warning')} in ${plural(sum.files, 'file')}.`, '']
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
        const line = d.location ? createLineIndex(input.text(d.location.path) ?? '').position(d.location.range.start).line + 1 : undefined
        const where = d.location ? `\`${ctx.displayPath(d.location.path, input.project)}:${line}\`` : ''
        out.push(`| ${d.severity} | \`${d.code}\` | ${where} | ${escapeCell(d.message)} |`)
      }
      if (input.diagnostics.length > 200)
        out.push('', `_${input.diagnostics.length - 200} more not shown._`)
      out.push('')
    }
    return `${out.join('\n')}\n`
  },
}

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
        const level = d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'notice'
        const props = [`title=${escapeProperty(`x18n ${d.code}`)}`]
        if (d.location) {
          const wire = toWireDiagnostic(input.project, d, input.text).range!
          props.unshift(`file=${escapeProperty(ctx.displayPath(d.location.path, input.project))}`, `line=${wire.line}`, `col=${wire.column}`, `endLine=${wire.endLine}`, `endColumn=${wire.endColumn}`)
        }
        out.push(`::${level} ${props.join(',')}::${escapeData(d.message)}`)
      }
    }
    return out.length ? `${out.join('\n')}\n` : ''
  },
}

/** SARIF 2.1.0 for code scanning. */
export const sarifReporter: Reporter = {
  id: 'sarif',
  report(inputs, ctx) {
    const all = inputs.flatMap(input => input.diagnostics.map(d => ({ input, d })))
    const rules = [...new Set(all.map(({ d }) => d.code))].sort()
    const results = all.map(({ input, d }) => {
      const wire = toWireDiagnostic(input.project, d, input.text)
      return {
        ruleId: d.code,
        level: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'note',
        message: { text: d.message },
        locations: d.location && wire.range
          ? [{ physicalLocation: { artifactLocation: { uri: ctx.displayPath(d.location.path, input.project) }, region: { startLine: wire.range.line, startColumn: wire.range.column, endLine: wire.range.endLine, endColumn: wire.range.endColumn } } }]
          : [],
      }
    })
    const log = {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'x18n', informationUri: 'https://x18n.antfu.dev', rules: rules.map(id => ({ id, helpUri: `https://x18n.antfu.dev/checks/${id}` })) } },
        results,
      }],
    }
    return `${JSON.stringify(log, null, 2)}\n`
  },
}

export function reporters(): Plugin {
  return { name: 'x18n:reporters', reporters: [prettyReporter, jsonReporter, markdownReporter, githubReporter, sarifReporter] }
}

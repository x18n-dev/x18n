import type { ReporterContext, ReportInput, ReportSummary } from '@x18n/core'

export const codes = {
  red: 31,
  yellow: 33,
  cyan: 36,
  gray: 90,
  blue: 34,
  bold: 1,
} as const
export type Color = keyof typeof codes

export function paint(ctx: ReporterContext, color: Color, text: string): string {
  return ctx.color
    ? `\u001B[${codes[color]}m${text}\u001B[0m`
    : text
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1
    ? ''
    : 's'}`
}

export function totals(inputs: readonly ReportInput[]): ReportSummary {
  return inputs.reduce((sum, input) => ({
    errors: sum.errors + input.summary.errors,
    warnings: sum.warnings + input.summary.warnings,
    infos: sum.infos + input.summary.infos,
    files: sum.files + input.summary.files,
  }), {
    errors: 0,
    warnings: 0,
    infos: 0,
    files: 0,
  })
}

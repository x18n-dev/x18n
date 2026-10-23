import type { Reporter } from '@x18n/core'
import { toWireDiagnostic } from '@x18n/core'

/** SARIF 2.1.0 for code scanning. */
export const sarifReporter: Reporter = {
  id: 'sarif',
  report(inputs, ctx) {
    const all = inputs.flatMap(input => input.diagnostics.map(d => ({ input, d })))
    const rules = [
      ...new Set(all.map(({ d }) => d.code)),
    ].sort()
    const results = all.map(({ input, d }) => {
      const wire = toWireDiagnostic(input.project, d, input.text)
      return {
        ruleId: d.code,
        level: d.severity === 'error'
          ? 'error'
          : d.severity === 'warning'
            ? 'warning'
            : 'note',
        message: { text: d.message },
        locations: d.location && wire.range
          ? [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: ctx.displayPath(d.location.path, input.project),
                  },
                  region: {
                    startLine: wire.range.line,
                    startColumn: wire.range.column,
                    endLine: wire.range.endLine,
                    endColumn: wire.range.endColumn,
                  },
                },
              },
            ]
          : [],
      }
    })
    const log = {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'x18n',
              informationUri: 'https://x18n.antfu.dev',
              rules: rules.map(id => ({ id, helpUri: `https://x18n.antfu.dev/checks/${id}` })),
            },
          },
          results,
        },
      ],
    }
    return `${JSON.stringify(log, null, 2)}\n`
  },
}

export default sarifReporter

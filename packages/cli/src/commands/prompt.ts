import type { GlobalOptions } from '../context'
import { errors, renderPrompt } from '@x18n/core'
import { openWorkspace, out, printJson, singleProject } from '../context'

export interface PromptCommandOptions extends GlobalOptions {
  readonly to?: string | undefined
  readonly locale?: string | undefined
  readonly keys?: string | undefined
  readonly namespace?: string | undefined
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
  readonly format?: string | undefined
  readonly context?: boolean | undefined
  readonly stale?: boolean | undefined
}

export async function prompt(kind: string, options: PromptCommandOptions): Promise<void> {
  if (kind !== 'translate' && kind !== 'review')
    throw errors.X18N0001({ issue: `unknown prompt "${kind}" (translate, review)` })
  const locale = kind === 'translate'
    ? options.to
    : options.locale ?? options.to
  if (!locale) {
    throw errors.X18N0001({
      issue: kind === 'translate'
        ? 'pass --to <locale>'
        : 'pass --locale <locale>',
    })
  }
  const { project, host } = singleProject(await openWorkspace(options))
  if (options.stale) {
    await project.loadHistory()
    await host.flush()
  }
  const data = project.prompt(kind, locale, {
    keys: options.keys,
    namespace: options.namespace,
    limit: options.limit === undefined
      ? undefined
      : Number(options.limit),
    cursor: options.cursor,
    context: options.context,
    stale: options.stale,
  })
  if (options.json || options.format === 'json')
    printJson(`prompt ${kind}`, data)
  else
    out(renderPrompt(data))
}

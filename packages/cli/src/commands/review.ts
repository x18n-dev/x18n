import type { EditOp, ReviewAuthor, ReviewType } from '@x18n/core'
import type { GlobalOptions } from '../context'
import { errors } from '@x18n/core'
import { openWorkspace, out, printJson, runPlan, singleProject } from '../context'

export interface ReviewOptions extends GlobalOptions {
  readonly locale?: string | readonly string[] | undefined
  readonly text?: string | undefined
  readonly value?: string | undefined
  readonly author?: string | undefined
  readonly open?: boolean | undefined
  readonly dryRun?: boolean | undefined
}

const commentTypes: Readonly<Record<string, ReviewType>> = {
  'comment': 'comment',
  'approve': 'approve',
  'request-change': 'request-change',
  'suggest': 'suggestion',
}

/** `Ada <ada@example.com>`, `Ada` or `ada@example.com`. */
function parseAuthor(input: string): ReviewAuthor {
  const text = input.trim()
  const open = text.lastIndexOf('<')
  if (open >= 0 && text.endsWith('>')) {
    const name = text.slice(0, open).trim()
    return {
      ...name && { name },
      email: text.slice(open + 1, -1).trim(),
    }
  }
  return text.includes('@')
    ? { email: text }
    : { name: text }
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value === '')
    throw errors.X18N4008({ reason: `pass ${flag}` })
  return String(value)
}

async function list(target: string | undefined, options: ReviewOptions): Promise<void> {
  const workspace = await openWorkspace(options)
  const locale = options.locale === undefined
    ? undefined
    : String([options.locale].flat()[0])
  const projects = workspace.projects.map(({ name, project }) => ({
    name,
    threads: project.reviews({
      key: target === undefined
        ? undefined
        : project.parseKey(target),
      locale,
      open: options.open,
    }),
  }))
  if (options.json) {
    printJson('review list', { projects })
    return
  }
  const threads = projects.flatMap(p => p.threads)
  if (threads.length === 0)
    out(options.open ? 'No open reviews.' : 'No reviews.')
  for (const thread of threads) {
    out(`${thread.key}  ${thread.locale}${thread.state
      ? `  ${thread.state.replace('-', ' ')}`
      : ''}`)
    for (const c of thread.comments) {
      const flags = [
        c.resolved && 'resolved',
        c.stale && 'stale',
      ].filter(Boolean).join(', ')
      out(`  ${c.id}  ${c.type.padEnd(14)} ${c.author?.name ?? c.author?.email ?? '-'}  ${c.time.slice(0, 10)}${flags
        ? `  (${flags})`
        : ''}`)
      if (c.text)
        out(`    ${c.text}`)
      if (c.suggestion !== undefined)
        out(`    suggests ${JSON.stringify(c.suggestion)}`)
    }
  }
}

/** `x18n review <action> [target]`: list, comment, approve, request-change, suggest, resolve, apply-suggestion, mark-fresh. */
export async function review(action: string, target: string | undefined, options: ReviewOptions): Promise<void> {
  if (action === 'list')
    return list(target, options)
  const loaded = singleProject(await openWorkspace(options))
  const { project } = loaded
  const locales = options.locale === undefined
    ? undefined
    : [options.locale].flat().map(String)
  let op: EditOp
  const type = commentTypes[action]
  if (type) {
    const locale = locales?.[0]
    if (locale === undefined)
      throw errors.X18N4008({ reason: 'pass --locale <locale>' })
    op = {
      type: 'review',
      key: project.parseKey(required(target, '<key>')),
      locale,
      review: type,
      text: type === 'request-change'
        ? required(options.text, '--text <text>')
        : options.text === undefined
          ? undefined
          : String(options.text),
      suggestion: type === 'suggestion'
        ? required(options.value, '--value <value>')
        : undefined,
      author: options.author === undefined
        ? await project.reviewAuthor()
        : parseAuthor(options.author),
    }
  }
  else if (action === 'resolve' || action === 'apply-suggestion') {
    op = {
      type: action === 'resolve'
        ? 'resolve-review'
        : 'apply-suggestion',
      id: required(target, '<id>'),
    }
  }
  else if (action === 'mark-fresh') {
    op = {
      type: 'mark-fresh',
      key: project.parseKey(required(target, '<key>')),
      locales,
    }
  }
  else {
    throw errors.X18N4008({ reason: `unknown review action "${action}" (list, comment, approve, request-change, suggest, resolve, apply-suggestion, mark-fresh)` })
  }
  await runPlan(`review ${action}`, loaded, project.plan([op]), options)
}

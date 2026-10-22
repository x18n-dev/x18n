import type { ResolvedConfig } from '../types/config'
import type { KeyString, TextRange, Usage } from '../types/model'
import type { KeyContext, Scope, UsageCandidate } from '../types/plugin'
import { joinKey } from '../keys'

export interface UsageResolver {
  readonly resolve: (candidate: UsageCandidate, scopes: readonly Scope[], path: string, scanner: string) => Usage
}

function innermost(scopes: readonly Scope[], range: TextRange): Scope | undefined {
  let best: Scope | undefined
  for (const scope of scopes) {
    const contains = scope.range.start <= range.start && scope.range.end >= range.end
    if (contains && (!best || scope.range.end - scope.range.start < best.range.end - best.range.start))
      best = scope
  }
  return best
}

export function createUsageResolver(
  config: ResolvedConfig,
  namespaced: boolean,
  normalizers: readonly ((raw: string, ctx: KeyContext) => string | undefined)[],
): UsageResolver {
  const separator = config.namespace.separator
  return {
    resolve(candidate, scopes, path, scanner) {
      const scope = innermost(scopes, candidate.range)
      const ctx = { path }
      let text = candidate.raw
      for (const normalize of normalizers) {
        const result = normalize(text, ctx)
        if (result !== undefined) {
          text = result
          break
        }
      }
      const scopeNamespace = candidate.namespace ?? scope?.namespace
      const scopePrefix = candidate.keyPrefix ?? scope?.keyPrefix
      let namespace: string | undefined
      let explicit = false
      if (namespaced) {
        const index = text.indexOf(separator)
        explicit = index > 0
        if (explicit) {
          namespace = text.slice(0, index)
          text = text.slice(index + separator.length)
        }
        else {
          namespace = scopeNamespace ?? config.namespace.default
        }
      }
      // An explicit namespace (`t('common:save')`) leaves the scope's key prefix out.
      if (scopePrefix && !explicit)
        text = text ? `${scopePrefix}.${text}` : scopePrefix
      let key: KeyString | undefined
      if (candidate.dynamic === 'unknown')
        key = undefined
      else
        key = joinKey(namespace, text === '' ? [] : text.split('.'))
      return {
        key,
        raw: candidate.raw,
        path,
        range: candidate.range,
        expression: candidate.expression,
        scanner,
        kind: candidate.kind,
        dynamic: candidate.dynamic,
        locale: candidate.locale,
        scopeNamespace,
        scopePrefix,
      }
    },
  }
}

/** True when a prefix usage may refer to `key`. The key of `t(`pages.${id}`)` is `pages.`, so only children match. */
export function prefixMatches(usage: Usage, key: KeyString): boolean {
  return usage.dynamic === 'prefix' && usage.key !== undefined && key.startsWith(usage.key)
}

/** Ranges covered by `x18n-disable-next-line` and `x18n-disable` ... `x18n-enable` comments. */
export function suppressedRanges(text: string): TextRange[] {
  if (!text.includes('x18n-disable'))
    return []
  const ranges: TextRange[] = []
  const nextLine = /x18n-disable-next-line/g
  for (const match of text.matchAll(nextLine)) {
    const lineEnd = text.indexOf('\n', match.index)
    if (lineEnd === -1)
      continue
    const nextEnd = text.indexOf('\n', lineEnd + 1)
    ranges.push({ start: lineEnd + 1, end: nextEnd === -1 ? text.length : nextEnd })
  }
  const block = /x18n-disable(?![-\w])/g
  for (const match of text.matchAll(block)) {
    const end = text.indexOf('x18n-enable', match.index)
    ranges.push({ start: match.index, end: end === -1 ? text.length : end })
  }
  return ranges
}

/** Compiles derived-key rules (`{key}_plural`, `{key}_*`) into a function from a key to its base key. */
export function derivedBase(rules: readonly string[]): (key: KeyString) => KeyString | undefined {
  const regexes = rules.map((rule) => {
    const source = rule
      .split('{key}')
      .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.:]+'))
      .join('(.+)')
    return new RegExp(`^${source}$`)
  })
  return (key) => {
    for (const re of regexes) {
      const match = re.exec(key)
      if (match?.[1])
        return match[1]
    }
    return undefined
  }
}

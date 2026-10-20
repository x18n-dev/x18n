// Adapted from i18n-ally (MIT), src/utils/Regex.ts
import type { Plugin, RegexScannerSpec, Scanner, Scope, UsageCandidate } from '@x18n/core'

/** The key part of i18n-ally `usageMatchRegex` patterns. */
const keyPattern = '[\\w\\d\\. \\-\\[\\]\\/:]+?'

/** Turns a pattern with a `{key}` placeholder into a regex whose first group is the key. */
export function compileUsagePattern(pattern: string): RegExp {
  const source = pattern.includes('{key}') ? pattern.replace('{key}', keyPattern) : pattern
  return new RegExp(source, 'dg')
}

export function scanWithRegex(text: string, regexes: readonly RegExp[]): UsageCandidate[] {
  const out: UsageCandidate[] = []
  for (const regex of regexes) {
    regex.lastIndex = 0
    for (const match of text.matchAll(regex)) {
      const indices = match.indices?.[1]
      const raw = match[1]
      if (!indices || raw === undefined)
        continue
      out.push({ raw, range: { start: indices[0], end: indices[1] }, kind: 'call', dynamic: false })
    }
  }
  return out
}

/** The `regex` scanner over `usage.regex` specs, plus extra specs given here (YAML plugins). */
export function regex(specs: readonly RegexScannerSpec[] = [], id = 'regex'): Plugin {
  const cache = new Map<string, RegExp[]>()
  const regexesFor = (extension: string, all: readonly RegexScannerSpec[]): RegExp[] => {
    const key = `${extension}\0${all.length}`
    let list = cache.get(key)
    if (!list) {
      list = all.filter(spec => spec.extensions.includes(extension)).flatMap(spec => spec.patterns.map(compileUsagePattern))
      cache.set(key, list)
    }
    return list
  }
  let extensions: string[] = [...new Set(specs.flatMap(spec => spec.extensions))]
  const scanner: Scanner = {
    id,
    get extensions() {
      return extensions
    },
    scan(file, ctx) {
      const all = [...specs, ...ctx.config.usage.regex]
      const usages = scanWithRegex(file.text, regexesFor(file.extension, all))
      return { usages, keySlots: usages.map(usage => usage.range) }
    },
  }
  return {
    name: `x18n:scanner-${id}`,
    configResolved(config) {
      extensions = [...new Set([...specs, ...config.usage.regex].flatMap(spec => spec.extensions))]
    },
    scanners: [scanner],
  }
}

/**
 * Regions after each match of `pattern` (group 1 = namespace, or key prefix with `as: 'keyPrefix'`),
 * up to the next match: i18n-ally `scopeRangeRegex`. With `wholeFile`, the first match scopes the whole file.
 */
export function regexScopes(pattern: string, id = 'scopes', options: { readonly as?: 'namespace' | 'keyPrefix', readonly extensions?: readonly string[], readonly wholeFile?: boolean } = {}): Plugin {
  const re = new RegExp(pattern, 'g')
  return {
    name: `x18n:scanner-${id}`,
    scanners: [{
      id,
      extensions: options.extensions ?? ['*'],
      scan(file) {
        const matches = [...file.text.matchAll(re)]
        if (options.wholeFile)
          matches.splice(1)
        const scopes: Scope[] = matches.map((match, i) => ({
          range: options.wholeFile ? { start: 0, end: file.text.length } : { start: match.index + match[0].length, end: matches[i + 1]?.index ?? file.text.length },
          ...options.as === 'keyPrefix' ? { keyPrefix: match[1] } : { namespace: match[1] },
        }))
        return { usages: [], scopes }
      },
    }],
  }
}

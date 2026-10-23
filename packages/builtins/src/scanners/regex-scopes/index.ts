// Adapted from i18n-ally (MIT), src/utils/Regex.ts
import type { Plugin, Scope } from '@x18n/core'

/**
 * Regions after each match of `pattern` (group 1 = namespace, or key prefix with `as: 'keyPrefix'`; or the
 * named groups `namespace` and `keyPrefix`), up to the next match: i18n-ally `scopeRangeRegex`.
 * With `wholeFile`, the first match scopes the whole file. Matches that capture nothing are skipped.
 */
export function regexScopes(pattern: string, id = 'scopes', options: { readonly as?: 'namespace' | 'keyPrefix', readonly extensions?: readonly string[], readonly wholeFile?: boolean } = {}): Plugin {
  const re = new RegExp(pattern, 'g')
  return {
    name: `x18n:scanner-${id}`,
    scanners: [
      {
        id,
        extensions: options.extensions ?? ['*'],
        scan(file) {
          const found = [
            ...file.text.matchAll(re),
          ].map(match => ({
            match,
            values: match.groups
              ? { namespace: match.groups.namespace, keyPrefix: match.groups.keyPrefix }
              : options.as === 'keyPrefix'
                ? { keyPrefix: match[1] }
                : { namespace: match[1] },
          })).filter(({ values }) => values.namespace !== undefined || values.keyPrefix !== undefined)
          if (options.wholeFile)
            found.splice(1)
          const scopes: Scope[] = found.map(({ match, values }, i) => ({
            range: options.wholeFile
              ? { start: 0, end: file.text.length }
              : { start: match.index + match[0].length, end: found[i + 1]?.match.index ?? file.text.length },
            ...values,
          }))
          return { usages: [], scopes }
        },
      },
    ],
  }
}

export default regexScopes

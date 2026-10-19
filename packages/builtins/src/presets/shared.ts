import type { CallSpec, ConfigContext, ConfigDraft, DetectContext, ExtractTemplate, LocaleFinder, NamespaceFromPath, Plugin, RegexScannerSpec, ResourceSpec, ResourceTransform } from '@x18n/core'

export interface LibraryOptions {
  readonly name: string
  readonly calls?: readonly CallSpec[]
  /** i18n-ally style `usageMatchRegex` patterns, for languages without an AST scanner. */
  readonly regex?: readonly RegexScannerSpec[]
  readonly derivedKeys?: readonly string[]
  readonly namespace?: { readonly separator?: string, readonly default?: string, readonly fromPath?: NamespaceFromPath }
  /** Default resource patterns (i18n-ally `preferredLocalePaths` + `pathMatcher`). */
  readonly resources?: readonly ResourceSpec[]
  readonly keyStyle?: 'nested' | 'flat'
  readonly templates?: readonly ExtractTemplate[]
  readonly finders?: readonly LocaleFinder[]
  readonly normalizeKey?: Plugin['normalizeKey']
  readonly transformResource?: ResourceTransform
  readonly extra?: (draft: ConfigDraft, ctx: ConfigContext) => void | Promise<void>
  readonly translatePrompt?: Plugin['translatePrompt']
}

/** One plugin holding a library's call specs, regexes, namespace rules, defaults and extraction templates. */
export function library(options: LibraryOptions): Plugin {
  return {
    name: `x18n:${options.name}`,
    async config(draft, ctx) {
      if (options.namespace) {
        draft.namespace = {
          separator: options.namespace.separator ?? draft.namespace.separator,
          default: draft.namespace.default ?? options.namespace.default,
          fromPath: options.namespace.fromPath ?? draft.namespace.fromPath,
        }
      }
      // Defaults of every detected library add up; a user `resources` replaces them all.
      if (options.resources)
        draft.resources = [...draft.resources, ...options.resources.filter(spec => !draft.resources.some(r => r.pattern === spec.pattern))]
      if (options.keyStyle && draft.keyStyle === 'auto' && !ctx.user.keyStyle)
        draft.keyStyle = options.keyStyle
      draft.usage = {
        ...draft.usage,
        calls: [...draft.usage.calls, ...options.calls ?? []],
        regex: [...draft.usage.regex, ...options.regex ?? []],
        derivedKeys: [...draft.usage.derivedKeys, ...options.derivedKeys ?? []],
      }
      await options.extra?.(draft, ctx)
    },
    localeFinders: options.finders,
    normalizeKey: options.normalizeKey,
    transformResource: options.transformResource,
    translatePrompt: options.translatePrompt,
    extractors: options.templates ? [{ id: options.name, templates: options.templates }] : undefined,
  }
}

export function dependsOn(names: readonly string[], prefixes: readonly string[] = []): (ctx: DetectContext) => boolean {
  return ctx => ctx.hasAnyDependency(names) || [...ctx.dependencies].some(dep => prefixes.some(prefix => dep.startsWith(prefix)))
}

/** Extensions of JS and TS sources. */
export const scriptExtensions: readonly string[] = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']

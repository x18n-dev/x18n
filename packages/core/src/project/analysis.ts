import type { X18nError } from '../errors'
import type { PluginRegistry } from '../plugins'
import type { CheckSetting, ResolvedConfig } from '../types/config'
import type { Diagnostic, JsonObject, KeyString, LocaleCode, LocaleInfo, Message, MessageTree, NodeRange, Placeholder, Resource, Severity, Usage } from '../types/model'
import type { Check, CheckContext, DiagnosticInput, HardString, LocaleCoverage, ScanResult } from '../types/plugin'
import type { Analysis } from '../types/project'
import { keyMatcher } from '../keys'

export interface ResourceState {
  readonly resource: Resource
  readonly hash: string
  readonly content: string
  /** Offset of the content in the file (non-zero for blocks). */
  readonly offset: number
  /** Keys as the project sees them, after resource transforms. */
  readonly tree: MessageTree
  /** The tree as stored in the file. Edits work on it. */
  readonly rawTree: MessageTree
  /** Maps a key path of `tree` to its path in `rawTree`. */
  readonly toStored: (path: readonly string[]) => string[]
  readonly ranges: ReadonlyMap<string, NodeRange>
  readonly error: X18nError | undefined
}

interface AnalyzerState {
  readonly revision: number
  readonly sourceLocale: LocaleCode
  readonly locales: readonly LocaleCode[]
  readonly resources: readonly ResourceState[]
  readonly resourceErrors: readonly { readonly error: X18nError, readonly path: string }[]
  readonly scanErrors: readonly { readonly error: X18nError, readonly path: string }[]
  readonly discoveryErrors: readonly { readonly error: X18nError, readonly path: string }[]
  readonly messages: ReadonlyMap<KeyString, ReadonlyMap<LocaleCode, readonly Message[]>>
  readonly parents: ReadonlySet<KeyString>
  readonly usages: readonly Usage[]
  readonly usagesByKey: ReadonlyMap<KeyString, readonly Usage[]>
  readonly prefixUsages: readonly Usage[]
  readonly derived: ReadonlyMap<KeyString, readonly KeyString[]>
  readonly files: ReadonlyMap<string, { readonly result: ScanResult }>
}

export interface AnalyzerOptions {
  readonly config: ResolvedConfig
  readonly registry: PluginRegistry
  readonly state: () => AnalyzerState
  readonly baseOf: (key: KeyString) => KeyString | undefined
  readonly localeInfo: (code: LocaleCode) => LocaleInfo
  readonly text: (path: string) => string | undefined
}

function levelOf(setting: CheckSetting | undefined): { level: Severity | 'off', options: JsonObject } | undefined {
  if (setting === undefined)
    return undefined
  if (typeof setting === 'string')
    return { level: setting, options: {} }
  return { level: setting[0], options: setting[1] }
}

function computeCoverage(messages: AnalyzerState['messages'], locales: readonly LocaleCode[], reference: readonly KeyString[]): LocaleCoverage[] {
  return locales.map((locale) => {
    const missing: KeyString[] = []
    const empty: KeyString[] = []
    for (const key of reference) {
      const value = messages.get(key)?.get(locale)?.[0]?.value
      if (value === undefined)
        missing.push(key)
      else if (value === '')
        empty.push(key)
    }
    return { locale, total: reference.length, translated: reference.length - missing.length - empty.length, missing, empty }
  })
}

function errorDiagnostics(state: AnalyzerState): Diagnostic[] {
  return [...state.discoveryErrors, ...state.resourceErrors, ...state.scanErrors].map(({ error, path }) => ({
    code: 'invalid-resource',
    severity: error.code.startsWith('X18N3') ? 'warning' : 'error',
    message: `${error.message} (${error.code})`,
    key: undefined,
    locale: undefined,
    location: { path, range: { start: 0, end: 0 } },
    fixes: [],
  }))
}

interface RunChecksInput {
  readonly config: ResolvedConfig
  readonly registry: PluginRegistry
  readonly ctx: Omit<CheckContext, 'options'>
  readonly state: AnalyzerState
  readonly ignored: (key: KeyString) => boolean
}

function* runCheck(check: Check, level: Severity, inputs: Iterable<DiagnosticInput>, input: RunChecksInput): Generator<Diagnostic> {
  const { state, config } = input
  const resourcePath = (id: string): string => state.resources.find(s => s.resource.id === id)?.resource.path ?? id
  for (const item of inputs) {
    if (item.key !== undefined && input.ignored(item.key))
      continue
    const severity = config.strict && (item.severity ?? level) === 'warning' ? 'error' : item.severity ?? level
    let location = item.location
    if (!location && item.key !== undefined) {
      const byLocale = state.messages.get(item.key)
      const found = byLocale?.get(item.locale ?? state.sourceLocale)?.[0] ?? byLocale?.get(state.sourceLocale)?.[0]
      if (found)
        location = { path: resourcePath(found.resource), range: found.range?.key ?? { start: 0, end: 0 } }
    }
    yield { code: check.id, severity, message: item.message, key: item.key, locale: item.locale, location, fixes: item.fixes ?? [] }
  }
}

function runChecks(input: RunChecksInput): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const check of input.registry.checks.values()) {
    const setting = levelOf(input.config.checks[check.id]) ?? { level: check.defaultSeverity, options: {} }
    if (setting.level === 'off')
      continue
    try {
      out.push(...runCheck(check, setting.level, check.run({ ...input.ctx, options: setting.options }), input))
    }
    catch (error) {
      out.push({
        code: check.id,
        severity: 'error',
        message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
        key: undefined,
        locale: undefined,
        location: undefined,
        fixes: [],
      })
    }
  }
  return out
}

export function createAnalyzer(options: AnalyzerOptions): { readonly analyze: () => Analysis } {
  const { config, registry } = options
  let memo: Analysis | undefined
  const ignored = keyMatcher(config.ignoreKeys)
  const inUse = keyMatcher(config.usage.keysInUse)
  // Values rarely change between revisions; finding placeholders is the cost of several checks.
  const placeholderCache = new Map<string, readonly Placeholder[]>()

  function analyze(): Analysis {
    const state = options.state()
    if (memo && memo.revision === state.revision)
      return memo
    const { sourceLocale, locales, messages } = state
    const sourceKeys = [...messages.keys()].filter(key => messages.get(key)?.has(sourceLocale)).sort()
    const allKeys = [...messages.keys()].sort()
    const reference = sourceKeys.length > 0 ? sourceKeys : allKeys

    const coverage = computeCoverage(messages, locales, reference)

    const isDefined = (key: KeyString): boolean =>
      messages.get(key)?.has(sourceLocale) === true
      || state.parents.has(key)
      || (state.derived.get(key)?.length ?? 0) > 0
      || (sourceKeys.length === 0 && messages.has(key))

    // Without scanned source files every key would look unused.
    const hasScanners = state.files.size > 0
    const referenceSyntaxes = registry.placeholders.filter(syntax => syntax.reference)
    const referenced = new Set<KeyString>()
    if (referenceSyntaxes.length > 0) {
      for (const byLocale of messages.values()) {
        const value = byLocale.get(sourceLocale)?.[0]?.value
        if (typeof value === 'string')
          referenceSyntaxes.forEach(syntax => syntax.find(value).forEach(p => referenced.add(p.name)))
      }
    }
    const prefixes = [...new Set(state.prefixUsages.flatMap(usage => usage.key === undefined ? [] : [usage.key]))]
    const isUsed = (key: KeyString): boolean => {
      if (state.usagesByKey.has(key) || inUse(key) || referenced.has(key))
        return true
      const base = options.baseOf(key)
      if (base !== undefined && (state.usagesByKey.has(base) || inUse(base)))
        return true
      return prefixes.some(prefix => key.startsWith(prefix))
    }
    const unused = hasScanners ? allKeys.filter(key => !isUsed(key)) : []
    const undefinedUsages = state.usages.filter(usage =>
      usage.dynamic === false && usage.key !== undefined && !isDefined(usage.key))

    const placeholders = (value: string): ReturnType<CheckContext['placeholders']> => {
      let found = placeholderCache.get(value)
      if (!found) {
        found = registry.placeholders.flatMap(syntax => syntax.find(value)).sort((a, b) => a.range.start - b.range.start)
        if (placeholderCache.size > 100_000)
          placeholderCache.clear()
        placeholderCache.set(value, found)
      }
      return found
    }

    const baseCtx: Omit<CheckContext, 'options'> = {
      config,
      sourceLocale,
      locales,
      resources: state.resources.map(s => s.resource),
      hasScanners,
      keys: () => allKeys,
      * messages(locale) {
        for (const byLocale of messages.values()) {
          for (const [code, list] of byLocale) {
            if (locale === undefined || code === locale)
              yield list[0]!
          }
        }
      },
      message: (key, locale) => messages.get(key)?.get(locale)?.[0],
      duplicates: (key, locale) => messages.get(key)?.get(locale) ?? [],
      usages: () => state.usages,
      coverage: () => coverage,
      unused: () => unused,
      undefinedUsages: () => undefinedUsages,
      placeholders,
      placeholderSyntaxes: registry.placeholders,
      syntaxErrors: value => registry.placeholders.flatMap(syntax => syntax.validate?.(value) ?? []),
      localeInfo: options.localeInfo,
      text: options.text,
      * hardStrings(): Generator<HardString & { readonly path: string }> {
        for (const [path, file] of state.files) {
          for (const hard of file.result.hardStrings ?? [])
            yield { ...hard, path }
        }
      },
    }

    const diagnostics = [
      ...errorDiagnostics(state),
      ...runChecks({ config, registry, ctx: baseCtx, state, ignored }),
    ]

    diagnostics.sort((a, b) =>
      (a.location?.path ?? '').localeCompare(b.location?.path ?? '')
      || (a.location?.range.start ?? 0) - (b.location?.range.start ?? 0)
      || a.code.localeCompare(b.code))

    memo = { revision: state.revision, diagnostics, coverage, unused, undefinedUsages }
    return memo
  }

  return { analyze }
}

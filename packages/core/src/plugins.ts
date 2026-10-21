import type { ResolvedConfig } from './types/config'
import type {
  Check,
  Extractor,
  Format,
  HistoryProvider,
  LocaleFinder,
  ManifestReader,
  PlaceholderSyntax,
  Plugin,
  Preset,
  Reporter,
  Scanner,
} from './types/plugin'
import { errors } from './errors'

export function isPreset(value: Plugin | Preset): value is Preset {
  return 'plugins' in value && Array.isArray(value.plugins)
}

export interface CapabilityConflict {
  readonly capability: 'format' | 'scanner'
  readonly extension: string
  readonly winner: string
  readonly loser: string
}

/** The capabilities of the final plugin list, indexed for the project engine. */
export interface PluginRegistry {
  readonly plugins: readonly Plugin[]
  readonly formats: readonly Format[]
  readonly finders: readonly LocaleFinder[]
  readonly scanners: readonly Scanner[]
  readonly checks: ReadonlyMap<string, Check>
  readonly reporters: ReadonlyMap<string, Reporter>
  readonly placeholders: readonly PlaceholderSyntax[]
  readonly manifests: readonly ManifestReader[]
  readonly extractors: readonly Extractor[]
  readonly histories: readonly HistoryProvider[]
  readonly conflicts: readonly CapabilityConflict[]
  /** Format for a file path: config `formats` first, then the first format that claims the extension. */
  readonly formatFor: (path: string, hint?: string) => Format | undefined
  readonly formatById: (id: string) => Format | undefined
  readonly scannersFor: (path: string) => readonly Scanner[]
}

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

function sortByEnforce(plugins: readonly Plugin[]): Plugin[] {
  const rank = (plugin: Plugin): number => plugin.enforce === 'pre' ? 0 : plugin.enforce === 'post' ? 2 : 1
  return [...plugins].sort((a, b) => rank(a) - rank(b))
}

function uniqueById<T extends { readonly id: string, readonly override?: boolean | undefined }>(items: readonly T[], kind: string): Map<string, T> {
  const out = new Map<string, T>()
  for (const item of items) {
    if (out.has(item.id) && !item.override)
      throw errors.X18N1002({ kind, id: item.id })
    out.set(item.id, item)
  }
  return out
}

export function createRegistry(input: readonly Plugin[], config: Pick<ResolvedConfig, 'formats'>): PluginRegistry {
  const plugins = sortByEnforce(input)
  const formats = plugins.flatMap(plugin => plugin.formats ?? [])
  const scanners = plugins.flatMap(plugin => plugin.scanners ?? [])
  const finders = [...uniqueById(plugins.flatMap(plugin => plugin.localeFinders ?? []), 'Locale finder').values()]
  const checks = uniqueById(plugins.flatMap(plugin => plugin.checks ?? []), 'Check')
  const reporters = uniqueById(plugins.flatMap(plugin => plugin.reporters ?? []), 'Reporter')
  const conflicts: CapabilityConflict[] = []

  const byExtension = new Map<string, Format>()
  for (const format of formats) {
    for (const extension of format.extensions) {
      const winner = byExtension.get(extension)
      if (winner)
        conflicts.push({ capability: 'format', extension, winner: winner.id, loser: format.id })
      else
        byExtension.set(extension, format)
    }
  }
  const formatById = (id: string): Format | undefined => formats.find(format => format.id === id)

  const scannerCache = new Map<string, Scanner[]>()

  return {
    plugins,
    formats,
    finders,
    scanners,
    checks,
    reporters,
    placeholders: plugins.flatMap(plugin => plugin.placeholders ?? []),
    manifests: plugins.flatMap(plugin => plugin.manifests ?? []),
    extractors: plugins.flatMap(plugin => plugin.extractors ?? []),
    histories: plugins.flatMap(plugin => plugin.histories ?? []),
    conflicts,
    formatById,
    formatFor(path, hint) {
      if (hint)
        return formatById(hint)
      const extension = extensionOf(path)
      const mapped = config.formats[extension]
      return mapped ? formatById(mapped) : byExtension.get(extension)
    },
    scannersFor(path) {
      const extension = extensionOf(path)
      let list = scannerCache.get(extension)
      if (!list) {
        list = extension ? scanners.filter(scanner => scanner.extensions.includes(extension) || scanner.extensions.includes('*')) : []
        scannerCache.set(extension, list)
      }
      return list
    },
  }
}

import type { Disposable, Logger } from '../types/host'
import type { KeyString, LocaleCode, MessageLeaf } from '../types/model'
import type { HistoryContext, HistoryProvider, MessageChange, MessageHistory } from '../types/plugin'

const localChange: MessageChange = { updatedAt: Number.POSITIVE_INFINITY }

/** A target message is stale when it last changed before its source message. */
export function isOutdated(source: MessageChange | undefined, target: MessageChange | undefined): boolean {
  return source !== undefined && target !== undefined && target.updatedAt < source.updatedAt
}

interface HistoryInput {
  readonly providers: readonly HistoryProvider[]
  readonly context: () => HistoryContext
  /** The current value of a message, to tell local changes. */
  readonly current: (key: KeyString, locale: LocaleCode) => MessageLeaf | undefined
  readonly onLoad: () => void
  readonly logger: Logger | undefined
}

export interface ProjectHistory {
  readonly load: (options: { readonly watch?: boolean | undefined }) => Promise<void>
  readonly get: (key: KeyString, locale: LocaleCode) => MessageChange | undefined
  readonly valueAt: (key: KeyString, locale: LocaleCode, at: number) => MessageLeaf | undefined
  readonly dispose: () => void
}

export function createHistory(input: HistoryInput): ProjectHistory {
  const { providers } = input
  let histories: MessageHistory[] = []
  let loading: Promise<void> | undefined
  let watchers: Disposable[] | undefined

  async function reload(): Promise<void> {
    const ctx = input.context()
    const loaded = await Promise.all(providers.map(provider => provider.load(ctx).catch((error: unknown) => {
      input.logger?.warn(`History provider "${provider.id}" failed: ${error instanceof Error
        ? error.message
        : String(error)}`)
      return undefined
    })))
    histories = loaded.filter(history => history !== undefined)
    input.onLoad()
  }

  // Providers are asked in order; the first one with an entry for the message wins.
  const owner = (key: KeyString, locale: LocaleCode): { history: MessageHistory, change: MessageChange } | undefined => {
    for (const history of histories) {
      const change = history.changes.get(key)?.get(locale)
      if (change)
        return { history, change }
    }
    return undefined
  }

  return {
    load(options) {
      if (providers.length === 0)
        return Promise.resolve()
      loading ??= reload()
      if (options.watch && !watchers) {
        const ctx = input.context()
        watchers = providers.flatMap(provider => provider.watch
          ? [
              provider.watch(ctx, () => {
                loading = reload()
              }),
            ]
          : [])
      }
      return loading
    },
    get(key, locale) {
      const change = owner(key, locale)?.change
      if (!change)
        return undefined
      const current = input.current(key, locale)
      return change.value !== undefined && current !== undefined && current !== change.value
        ? localChange
        : change
    },
    valueAt: (key, locale, at) => owner(key, locale)?.history.valueAt?.(key, locale, at),
    dispose() {
      watchers?.forEach(watcher => watcher.dispose())
      watchers = undefined
    },
  }
}

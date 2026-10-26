import type { KeyString, LocaleCode, MessageLeaf } from '../types/model'
import type { ReviewComment, ReviewData, ReviewFilter, ReviewState, ReviewThread, ThreadComment } from '../types/review'
import { hashText } from '../text'

export const noReviews: ReviewData = { threads: {}, sources: {} }

/** What a review compares: message values as text. */
export function valueText(value: MessageLeaf): string {
  return value === null
    ? ''
    : String(value)
}

/** The hash recorded for a source value in `sources`. */
export function sourceHash(value: MessageLeaf): string {
  return hashText(JSON.stringify(value))
}

function reviewState(comments: readonly ThreadComment[]): ReviewState | undefined {
  const open = comments.filter(comment => !comment.resolved)
  const decisive = open.findLast(comment => comment.type === 'approve' || comment.type === 'request-change')
  if (decisive) {
    return decisive.type === 'request-change'
      ? 'changes-requested'
      : decisive.stale
        ? 'stale-approval'
        : 'approved'
  }
  if (open.some(comment => comment.type === 'suggestion'))
    return 'suggested'
  return open.length > 0
    ? 'commented'
    : undefined
}

/** A short random id that `taken` does not know. */
export function reviewId(taken: (id: string) => boolean): string {
  let id: string
  do
    id = Math.random().toString(36).slice(2, 8)
  while (id.length < 6 || taken(id))
  return id
}

function byCode(a: string, b: string): number {
  return a < b
    ? -1
    : a > b
      ? 1
      : 0
}

/** Threads in key order, then in the order of `locales`, then any other locale. */
export function listThreads(data: ReviewData, filter: ReviewFilter, locales: readonly LocaleCode[], current: (key: KeyString, locale: LocaleCode) => MessageLeaf | undefined): ReviewThread[] {
  const rank = (locale: LocaleCode): number => {
    const i = locales.indexOf(locale)
    return i < 0
      ? locales.length
      : i
  }
  const out: ReviewThread[] = []
  const keys = filter.key === undefined
    ? Object.keys(data.threads).sort(byCode)
    : [filter.key]
  for (const key of keys) {
    const byLocale = data.threads[key] ?? {}
    const codes = Object.keys(byLocale)
      .filter(locale => filter.locale === undefined || locale === filter.locale)
      .sort((a, b) => rank(a) - rank(b) || byCode(a, b))
    for (const locale of codes) {
      const value = current(key, locale)
      const comments = byLocale[locale]!
        .filter(comment => !filter.open || !comment.resolved)
        .map((comment): ThreadComment => ({
          ...comment,
          stale: comment.type === 'approve' && comment.value !== undefined && value !== undefined && valueText(value) !== comment.value,
        }))
      if (comments.length > 0) {
        out.push({
          key,
          locale,
          comments,
          state: reviewState(comments),
        })
      }
    }
  }
  return out
}

export function findReview(data: ReviewData, id: string): { key: KeyString, locale: LocaleCode, comment: ReviewComment } | undefined {
  for (const [key, byLocale] of Object.entries(data.threads)) {
    for (const [locale, comments] of Object.entries(byLocale)) {
      const comment = comments.find(c => c.id === id)
      if (comment)
        return { key, locale, comment }
    }
  }
  return undefined
}

function sorted<T>(map: ReadonlyMap<string, ReadonlyMap<string, T>>): { [key: string]: { [locale: string]: T } } {
  return Object.fromEntries([...map]
    .filter(([, inner]) => inner.size > 0)
    .sort(([a], [b]) => byCode(a, b))
    .map(([key, inner]) => [
      key,
      Object.fromEntries([...inner].sort(([a], [b]) => byCode(a, b))),
    ]))
}

/** Review data being changed by an edit plan. */
export class ReviewDraft {
  readonly threads: Map<KeyString, Map<LocaleCode, ReviewComment[]>>
  readonly sources: Map<KeyString, Map<LocaleCode, string>>
  changed = false

  constructor(data: ReviewData) {
    this.threads = new Map(Object.entries(data.threads).map(([key, byLocale]) => [
      key,
      new Map(Object.entries(byLocale).map(([locale, comments]) => [
        locale,
        [...comments],
      ])),
    ]))
    this.sources = new Map(Object.entries(data.sources).map(([key, byLocale]) => [
      key,
      new Map(Object.entries(byLocale)),
    ]))
  }

  add(key: KeyString, locale: LocaleCode, comment: ReviewComment): void {
    const byLocale = this.threads.get(key) ?? new Map<LocaleCode, ReviewComment[]>()
    this.threads.set(key, byLocale)
    byLocale.set(locale, [
      ...byLocale.get(locale) ?? [],
      comment,
    ])
    this.changed = true
  }

  resolve(id: string): void {
    for (const byLocale of this.threads.values()) {
      for (const [locale, list] of byLocale) {
        if (list.some(c => c.id === id)) {
          byLocale.set(locale, list.map(c => c.id === id
            ? { ...c, resolved: true }
            : c))
          this.changed = true
        }
      }
    }
  }

  record(key: KeyString, locale: LocaleCode, hash: string): void {
    const byLocale = this.sources.get(key) ?? new Map<LocaleCode, string>()
    this.sources.set(key, byLocale)
    if (byLocale.get(locale) !== hash) {
      byLocale.set(locale, hash)
      this.changed = true
    }
  }

  /** Threads and records follow a renamed key. */
  move(from: KeyString, to: KeyString): void {
    const rekey = <T>(map: Map<KeyString, T>): void => {
      const entry = map.get(from)
      if (entry === undefined)
        return
      map.delete(from)
      map.set(to, entry)
      this.changed = true
    }
    rekey(this.threads)
    rekey(this.sources)
  }

  remove(key: KeyString, locales: 'all' | readonly LocaleCode[]): void {
    for (const map of [this.threads, this.sources]) {
      const byLocale = map.get(key)
      if (!byLocale)
        continue
      for (const locale of [
        ...byLocale.keys(),
      ]) {
        if (locales === 'all' || locales.includes(locale)) {
          byLocale.delete(locale)
          this.changed = true
        }
      }
      if (byLocale.size === 0)
        map.delete(key)
    }
  }

  data(): ReviewData {
    return {
      threads: sorted(this.threads),
      sources: sorted(this.sources),
    }
  }
}

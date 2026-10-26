import type { KeyString, LocaleCode } from './model'

export type ReviewType = 'comment' | 'approve' | 'request-change' | 'suggestion'

export interface ReviewAuthor {
  readonly name?: string | undefined
  readonly email?: string | undefined
}

/** One entry of a review thread, as stored. */
export interface ReviewComment {
  /** Short random id, unique within the review file. */
  readonly id: string
  readonly type: ReviewType
  readonly author?: ReviewAuthor | undefined
  /** ISO 8601 time. */
  readonly time: string
  readonly text?: string | undefined
  /** The proposed value of a `suggestion`. */
  readonly suggestion?: string | undefined
  /** The value an `approve` approved; the approval is stale once the message has another value. */
  readonly value?: string | undefined
  readonly resolved?: boolean | undefined
}

/** Everything a review store holds. */
export interface ReviewData {
  /** Comments per key and locale, oldest first. */
  readonly threads: { readonly [key: KeyString]: { readonly [locale: LocaleCode]: readonly ReviewComment[] } }
  /** Hash of the source value when x18n last wrote each target message. */
  readonly sources: { readonly [key: KeyString]: { readonly [locale: LocaleCode]: string } }
}

/** Reads and writes the review file (`review.file`). Core does the I/O and puts writes into edit plans. */
export interface ReviewStore {
  readonly id: string
  /** Throws on invalid content; core reports it as a coded error. */
  readonly parse: (text: string) => ReviewData
  readonly serialize: (data: ReviewData) => string
}

/** Where a thread stands: the last open approval or change request decides, then open suggestions, then open comments. */
export type ReviewState = 'changes-requested' | 'approved' | 'stale-approval' | 'suggested' | 'commented'

export interface ThreadComment extends ReviewComment {
  /** An approval of a value the message no longer has. */
  readonly stale: boolean
}

/** The comments on one message. */
export interface ReviewThread {
  readonly key: KeyString
  readonly locale: LocaleCode
  readonly comments: readonly ThreadComment[]
  /** Undefined when every comment is resolved. */
  readonly state: ReviewState | undefined
}

export interface ReviewFilter {
  readonly key?: KeyString | undefined
  readonly locale?: LocaleCode | undefined
  /** Only unresolved comments, and only threads that have some. */
  readonly open?: boolean | undefined
}

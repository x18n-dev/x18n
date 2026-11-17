import type { ExtractSelection } from '@x18n/builtins/extractors'

/** One row of the extract page: a generated selection plus the user's key edit and pick. */
export interface ExtractDraft {
  readonly id: string
  readonly candidate: ExtractSelection
  readonly key: string
  readonly picked: boolean
}

/** The source position and rendering context a draft belongs to. */
function draftId(candidate: Pick<ExtractSelection, 'path' | 'range' | 'original' | 'context'>): string {
  return JSON.stringify([
    candidate.path,
    candidate.range.start,
    candidate.range.end,
    candidate.original,
    candidate.context,
  ])
}

/** What a draft belongs to apart from its position: the same source keeps its draft when the range moves. */
function sourceOf(candidate: Pick<ExtractSelection, 'path' | 'original' | 'context'>): string {
  return JSON.stringify([
    candidate.path,
    candidate.original,
    candidate.context,
  ])
}

/** Items by source, oldest position first. */
function groupBy<T>(items: readonly T[], source: (item: T) => string, start: (item: T) => number): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = source(item)
    const list = groups.get(key) ?? []
    groups.set(key, list)
    list.push(item)
  }
  for (const list of groups.values())
    list.sort((a, b) => start(a) - start(b))
  return groups
}

/**
 * Carries key edits and picks over to a refreshed candidate list.
 *
 * Copies of the same text pair by position order. A range that moved says nothing about identity: two copies of the
 * same text are only told apart by the place they hold in their group. `submitted` holds the drafts of the rows just
 * applied, dropped before pairing.
 */
export function mergeDrafts(previous: readonly ExtractDraft[], rows: readonly ExtractSelection[], submitted: readonly string[] = []): ExtractDraft[] {
  const gone = new Set(submitted)
  const kept = previous.filter(draft => !gone.has(draft.id))
  const drafts = groupBy(kept, draft => sourceOf(draft.candidate), draft => draft.candidate.range.start)
  const lines = groupBy(rows, row => sourceOf(row), row => row.range.start)

  const carried = new Map<ExtractSelection, ExtractDraft>()
  for (const [source, group] of lines) {
    const available = drafts.get(source) ?? []
    for (const [i, row] of group.entries()) {
      const draft = available[i]
      if (draft)
        carried.set(row, draft)
    }
  }

  return rows.map((candidate) => {
    const before = carried.get(candidate)
    return {
      id: draftId(candidate),
      candidate,
      key: before && before.key !== before.candidate.key
        ? before.key
        : candidate.key,
      picked: before?.picked ?? false,
    }
  })
}

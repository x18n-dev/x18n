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
 * Pairs one source's rows with its drafts, both in position order.
 *
 * Nothing is carried over when a copy came or went: the order no longer says which draft was this row's own. A row
 * that kept its exact position keeps its draft only while it holds the same place in the group, or a moved range that
 * lands on another copy's old position would take that copy's draft.
 */
function pairGroup(available: readonly ExtractDraft[], group: readonly ExtractSelection[]): Map<ExtractSelection, ExtractDraft> {
  const carried = new Map<ExtractSelection, ExtractDraft>()
  if (available.length !== group.length)
    return carried

  const taken = new Set<ExtractDraft>()
  for (const [i, row] of group.entries()) {
    const draft = available[i]
    if (draft && draftId(row) === draft.id) {
      carried.set(row, draft)
      taken.add(draft)
    }
  }

  const left = available.filter(draft => !taken.has(draft))
  const moved = group.filter(row => !carried.has(row))
  for (const [i, row] of moved.entries()) {
    const draft = left[i]
    if (draft)
      carried.set(row, draft)
  }
  return carried
}

/**
 * Carries key edits and picks over to a refreshed candidate list.
 *
 * `submitted` holds the drafts of the rows just applied, dropped before pairing.
 */
export function mergeDrafts(previous: readonly ExtractDraft[], rows: readonly ExtractSelection[], submitted: readonly string[] = []): ExtractDraft[] {
  const gone = new Set(submitted)
  const kept = previous.filter(draft => !gone.has(draft.id))
  const drafts = groupBy(kept, draft => sourceOf(draft.candidate), draft => draft.candidate.range.start)
  const lines = groupBy(rows, row => sourceOf(row), row => row.range.start)

  const carried = new Map<ExtractSelection, ExtractDraft>()
  for (const [source, group] of lines) {
    for (const [row, draft] of pairGroup(drafts.get(source) ?? [], group))
      carried.set(row, draft)
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

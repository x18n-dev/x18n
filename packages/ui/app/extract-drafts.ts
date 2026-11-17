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

/** Drafts by the source they belong to, oldest position first. */
function groupBySource(drafts: readonly ExtractDraft[]): Map<string, ExtractDraft[]> {
  const groups = new Map<string, ExtractDraft[]>()
  for (const draft of drafts) {
    const source = sourceOf(draft.candidate)
    const list = groups.get(source) ?? []
    groups.set(source, list)
    list.push(draft)
  }
  for (const list of groups.values())
    list.sort((a, b) => a.candidate.range.start - b.candidate.range.start)
  return groups
}

/** A row at its exact position keeps its draft, whatever happened to the other copies. */
function takeExact(byId: ReadonlyMap<string, ExtractDraft>, rows: readonly ExtractSelection[]): Map<ExtractSelection, ExtractDraft> {
  const carried = new Map<ExtractSelection, ExtractDraft>()
  for (const candidate of rows) {
    const draft = byId.get(draftId(candidate))
    if (draft)
      carried.set(candidate, draft)
  }
  return carried
}

/**
 * A moved row keeps its draft only while every copy of its source is still there. One copy that came or went and the
 * order no longer says which draft was this row's own, so the row starts over instead of taking someone else's edit.
 */
function takeMoved(groups: ReadonlyMap<string, readonly ExtractDraft[]>, rows: readonly ExtractSelection[], taken: ReadonlySet<string>): Map<ExtractSelection, ExtractDraft> {
  const moved = new Map<string, ExtractSelection[]>()
  for (const candidate of rows) {
    const source = sourceOf(candidate)
    const list = moved.get(source) ?? []
    moved.set(source, list)
    list.push(candidate)
  }
  const carried = new Map<ExtractSelection, ExtractDraft>()
  for (const [source, candidates] of moved) {
    const left = groups.get(source)?.filter(draft => !taken.has(draft.id)) ?? []
    if (left.length !== candidates.length)
      continue
    for (const [i, candidate] of candidates.entries()) {
      const draft = left[i]
      if (draft)
        carried.set(candidate, draft)
    }
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
  const byId = new Map(kept.map(draft => [draft.id, draft]))
  const sorted = [
    ...rows,
  ].sort((a, b) => a.range.start - b.range.start)

  const exact = takeExact(byId, sorted)
  const taken = new Set([
    ...exact.values(),
  ].map(draft => draft.id))
  const moved = takeMoved(groupBySource(kept), sorted.filter(row => !exact.has(row)), taken)
  const carried = new Map([
    ...exact,
    ...moved,
  ])

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

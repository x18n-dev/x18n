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

/**
 * Carries key edits and picks over to a refreshed candidate list.
 *
 * The exact id wins. A source that moved (an extraction rewrote the text before it) keeps its draft through `sourceOf`
 * and the order of its copies. `submitted` holds the drafts of the rows just applied: drop them before pairing, or a
 * surviving copy of the same text inherits the edit of the one that left.
 */
export function mergeDrafts(previous: readonly ExtractDraft[], rows: readonly ExtractSelection[], submitted: readonly string[] = []): ExtractDraft[] {
  const gone = new Set(submitted)
  const kept = previous.filter(draft => !gone.has(draft.id))
  const byId = new Map(kept.map(draft => [draft.id, draft]))
  const groups = new Map<string, ExtractDraft[]>()
  for (const draft of kept) {
    const source = sourceOf(draft.candidate)
    const list = groups.get(source) ?? []
    groups.set(source, list)
    list.push(draft)
  }
  for (const list of groups.values())
    list.sort((a, b) => a.candidate.range.start - b.candidate.range.start)

  const used = new Set<string>()
  const position = new Map<string, number>()
  const carried = new Map<ExtractSelection, ExtractDraft>()
  for (const candidate of [
    ...rows,
  ].sort((a, b) => a.range.start - b.range.start)) {
    const source = sourceOf(candidate)
    const at = position.get(source) ?? 0
    position.set(source, at + 1)
    const before = byId.get(draftId(candidate)) ?? groups.get(source)?.[at]
    if (before && !used.has(before.id)) {
      used.add(before.id)
      carried.set(candidate, before)
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

import type { ExtractSelection } from '@x18n/builtins/extractors'
import { describe, expect, it } from 'vitest'
import { mergeDrafts } from '../app/extract-drafts'

function selection(start: number, original: string, context = 'ctx'): ExtractSelection {
  return {
    path: 'src/App.vue',
    line: 1,
    kind: 'vue-template-text',
    text: original,
    original,
    range: {
      start,
      end: start + original.length,
    },
    attribute: undefined,
    key: original.toLowerCase().replace(/\s+/g, ''),
    reused: false,
    value: original,
    replacement: '',
    imports: [],
    alternatives: [],
    context,
  }
}

describe('mergeDrafts', () => {
  it('keeps an edited key and pick at the same range', () => {
    const [draft] = mergeDrafts([], [
      selection(10, 'First string'),
    ])
    const merged = mergeDrafts([
      { ...draft!, key: 'first.edit', picked: true },
    ], [
      selection(10, 'First string'),
    ])
    expect(merged[0]!.key).toBe('first.edit')
    expect(merged[0]!.picked).toBe(true)
  })

  it('keeps an edited key and pick when an earlier extraction moved the range', () => {
    const before = mergeDrafts([], [
      selection(10, 'First string'),
      selection(30, 'Second string'),
    ])
    const drafts = before.map(draft => ({ ...draft, key: `${draft.candidate.key}.edit`, picked: true }))
    // `First string` became `{{ $t('firststring.edit') }}`, so every later range moves by 8.
    const after = mergeDrafts(drafts, [
      selection(38, 'Second string'),
    ], [drafts[0]!.id])
    expect(after[0]!.key).toBe('secondstring.edit')
    expect(after[0]!.picked).toBe(true)
  })

  it('does not give a surviving duplicate the draft of an extracted one', () => {
    const before = mergeDrafts([], [
      selection(10, 'Same message'),
      selection(30, 'Same message'),
    ])
    const drafts = [
      { ...before[0]!, key: 'first.edit', picked: true },
      { ...before[1]!, key: 'second.edit', picked: true },
    ]
    const after = mergeDrafts(drafts, [
      selection(38, 'Same message'),
    ], [drafts[0]!.id])
    expect(after[0]!.key).toBe('second.edit')
    expect(after[0]!.picked).toBe(true)
  })

  it('starts over when a copy of the same text came or went', () => {
    const before = mergeDrafts([], [
      selection(10, 'Same message'),
      selection(30, 'Same message'),
    ])
    const drafts = [
      { ...before[0]!, key: 'first.edit', picked: true },
      before[1]!,
    ]
    // The first copy is gone from the source, so the survivor cannot know which draft was its own.
    const after = mergeDrafts(drafts, [
      selection(8, 'Same message'),
    ])
    expect(after[0]!.key).toBe('samemessage')
    expect(after[0]!.picked).toBe(false)
  })

  it('starts over when the rendering context changed', () => {
    const before = mergeDrafts([], [
      selection(10, 'First string', 'v1'),
    ])
    const drafts = [
      { ...before[0]!, key: 'first.edit', picked: true },
    ]
    const after = mergeDrafts(drafts, [
      selection(10, 'First string', 'v2'),
    ])
    expect(after[0]!.key).toBe('firststring')
    expect(after[0]!.picked).toBe(false)
  })

  it('starts over for a new string above the edited ones', () => {
    const before = mergeDrafts([], [
      selection(10, 'First string'),
    ])
    const drafts = [
      { ...before[0]!, key: 'first.edit', picked: true },
    ]
    const after = mergeDrafts(drafts, [
      selection(0, 'Brand new'),
      selection(20, 'First string'),
    ])
    expect(after.map(draft => draft.key)).toEqual(['brandnew', 'first.edit'])
    expect(after.map(draft => draft.picked)).toEqual([false, true])
  })
})

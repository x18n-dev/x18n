import type { Decoration } from '@x18n/lsp'
import { describe, expect, it } from 'vitest'
import { computeInPlace, hintCovered } from '../src/model/inplace'

const range = (line: number, start: number, end: number) => ({ start: { line, character: start }, end: { line, character: end } })
const decorations: Decoration[] = [
  { range: range(1, 3, 12), expression: range(1, 0, 14), key: 'app.title', value: 'My App', state: 'ok' },
  { range: range(2, 3, 13), key: 'app.titel', value: undefined, state: 'missing' },
  { range: range(3, 3, 20), key: 'pages.', value: undefined, state: 'dynamic' },
  { range: range(4, 3, 9), key: 'long', value: 'A value well past the limit', state: 'ok' },
  { range: range(5, 3, 9), expression: { start: { line: 5, character: 0 }, end: { line: 6, character: 1 } }, key: 'multi', value: 'Line one\n  line two', state: 'ok' },
]

const keyOnly = { maxLength: 20, fullMatch: false }

describe('computeInPlace', () => {
  it('replaces short values, marks missing keys and skips dynamic and long ones', () => {
    expect(computeInPlace(decorations, [], keyOnly)).toEqual({
      replaced: [
        { range: range(1, 3, 12), text: 'My App', fullMatch: false },
        { range: range(5, 3, 9), text: 'Line one line two', fullMatch: false },
      ],
      missing: [range(2, 3, 13)],
    })
  })

  it('reveals the raw key on the cursor line and inside selections', () => {
    const cursor = range(1, 0, 0)
    expect(computeInPlace(decorations, [cursor], keyOnly).replaced.map(r => r.text)).toEqual(['Line one line two'])
    const selection = { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } }
    expect(computeInPlace(decorations, [selection], keyOnly).replaced).toEqual([])
  })

  it('replaces the whole call with full match, except calls over several lines', () => {
    expect(computeInPlace(decorations, [], { maxLength: 20, fullMatch: true }).replaced).toEqual([
      { range: range(1, 0, 14), text: 'My App', fullMatch: true },
      { range: range(5, 3, 9), text: 'Line one line two', fullMatch: false },
    ])
  })

  it('keeps missing keys marked on the cursor line', () => {
    expect(computeInPlace(decorations, [range(2, 5, 5)], keyOnly).missing).toEqual([range(2, 3, 13)])
  })
})

describe('hintCovered', () => {
  it('matches hints one past a key that in-place mode shows', () => {
    expect(hintCovered({ line: 1, character: 13 }, decorations, 20)).toBe(true)
    expect(hintCovered({ line: 4, character: 10 }, decorations, 20)).toBe(false)
    expect(hintCovered({ line: 4, character: 10 }, decorations, 40)).toBe(true)
  })
})

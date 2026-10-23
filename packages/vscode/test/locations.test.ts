import { describe, expect, it } from 'vitest'
import { adjacentRange, dedupeLocations } from '../src/model/locations'

function range(line: number, start: number, end: number) {
  return {
    start: { line, character: start },
    end: { line, character: end },
  }
}

describe('dedupeLocations', () => {
  it('drops locations with the same uri and range, keeping order', () => {
    const uri = {
      toString: () => 'file:///a.ts',
    }
    const locations = [
      {
        uri,
        range: range(1, 2, 5),
      },
      {
        uri: 'file:///en.json',
        range: range(1, 2, 5),
      },
      {
        uri: {
          toString: () => 'file:///a.ts',
        },
        range: range(1, 2, 5),
      },
      {
        uri,
        range: range(1, 2, 6),
      },
    ]
    expect(dedupeLocations(locations)).toEqual([locations[0], locations[1], locations[3]])
  })
})

describe('adjacentRange', () => {
  const ranges = [
    range(8, 1, 4),
    range(2, 1, 4),
    range(5, 1, 4),
  ]

  it('finds the next and previous usage', () => {
    expect(adjacentRange(ranges, { line: 3, character: 0 }, 1)).toEqual(range(5, 1, 4))
    expect(adjacentRange(ranges, { line: 3, character: 0 }, -1)).toEqual(range(2, 1, 4))
  })

  it('wraps around the file', () => {
    expect(adjacentRange(ranges, { line: 9, character: 0 }, 1)).toEqual(range(2, 1, 4))
    expect(adjacentRange(ranges, { line: 0, character: 0 }, -1)).toEqual(range(8, 1, 4))
    expect(adjacentRange([], { line: 0, character: 0 }, 1)).toBeUndefined()
  })
})

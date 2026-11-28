import type { MessageTree } from '../src'
import { describe, expect, it } from 'vitest'
import { applyMessageOps, buildTree, isMessageObject, isMessageTree, sortTree, walkLeaves } from '../src'

const byName = (a: string, b: string): number => a.localeCompare(b)

describe('a message tree that holds arrays', () => {
  describe('isMessageTree', () => {
    it('accepts an array as the value of a key', () => {
      expect(isMessageTree({
        list: ['A', 'B'],
      })).toBe(true)
    })

    it('accepts objects, arrays and leaves of every kind inside an array', () => {
      expect(isMessageTree({
        list: [
          { title: 'T' },
          ['x', 'y'],
          'z',
          1,
          true,
          null,
        ],
      })).toBe(true)
    })

    it('accepts an empty array', () => {
      expect(isMessageTree({ list: [] })).toBe(true)
    })

    it('rejects an array as the root', () => {
      expect(isMessageTree(['A'])).toBe(false)
    })

    it.each([
      ['undefined', undefined],
      [
        'a function',
        () => 'x',
      ],
      [
        'a symbol',
        Symbol('x'),
      ],
    ])('rejects %s inside an array', (_name, item) => {
      expect(isMessageTree({
        list: ['A', item],
      })).toBe(false)
    })

    it('rejects a hole in an array', () => {
      const list = ['A', 'B', 'C']
      delete list[1]
      expect(isMessageTree({ list })).toBe(false)
    })
  })

  describe('isMessageObject', () => {
    it('is true for an object of nodes', () => {
      expect(isMessageObject({ a: 'A' })).toBe(true)
      expect(isMessageObject({})).toBe(true)
    })

    it.each([
      [
        'an array',
        ['A'],
      ],
      ['a message', 'A'],
      ['null', null],
      ['a number', 1],
    ])('is false for %s', (_name, node) => {
      expect(isMessageObject(node as never)).toBe(false)
    })
  })

  describe('walkLeaves', () => {
    it('names an item by its index', () => {
      expect([
        ...walkLeaves({
          list: ['A', 'B'],
        }),
      ]).toEqual([
        {
          path: ['list', '0'],
          value: 'A',
        },
        {
          path: ['list', '1'],
          value: 'B',
        },
      ])
    })

    it('goes into an object inside an array', () => {
      expect([
        ...walkLeaves({
          steps: [
            { title: 'S1' },
            { title: 'S2', body: 'B2' },
          ],
        }),
      ].map(l => l.path.join('.'))).toEqual([
        'steps.0.title',
        'steps.1.title',
        'steps.1.body',
      ])
    })

    it('goes into an array inside an array', () => {
      expect([
        ...walkLeaves({
          m: [
            ['a', 'b'],
            ['c'],
          ],
        }),
      ].map(l => l.path.join('.'))).toEqual(['m.0.0', 'm.0.1', 'm.1.0'])
    })

    it('yields nothing for an empty array', () => {
      expect([
        ...walkLeaves({ list: [] }),
      ]).toEqual([])
    })

    it('does not mix an array with an object that has numeric keys', () => {
      expect([
        ...walkLeaves({
          code: { 404: 'Not found' },
        }),
      ].map(l => l.path.join('.'))).toEqual(['code.404'])
    })
  })

  // applyMessageOps works on a copy, so with no ops it shows the copy.
  describe('the copy applyMessageOps makes', () => {
    const source: MessageTree = {
      list: [
        'A',
        { title: 'T' },
      ],
      menu: { open: 'Open' },
    }

    it('keeps an array an array, at every depth', () => {
      const copy = applyMessageOps(source, []) as { list: unknown[] }
      expect(Array.isArray(copy.list)).toBe(true)
      expect(copy).toEqual(source)
    })

    it('does not share an array or an object in it with the source', () => {
      const copy = applyMessageOps(source, []) as { list: [string, { title: string }] }
      copy.list[0] = 'changed'
      copy.list[1].title = 'changed'
      expect(source).toEqual({
        list: [
          'A',
          { title: 'T' },
        ],
        menu: { open: 'Open' },
      })
    })
  })

  describe('sortTree', () => {
    it('keeps the order of an array', () => {
      expect(sortTree({
        list: ['b', 'a', 'c'],
      }, byName)).toEqual({
        list: ['b', 'a', 'c'],
      })
    })

    it('keeps an array an array', () => {
      expect(Array.isArray((sortTree({
        list: ['b', 'a'],
      }, byName) as { list: unknown }).list)).toBe(true)
    })

    it('sorts the keys of an object inside an array, and the keys around the array', () => {
      const sorted = sortTree({
        z: 'Z',
        list: [
          { b: 'B', a: 'A' },
          { d: 'D', c: 'C' },
        ],
        a: 'A',
      }, byName)
      expect(JSON.stringify(sorted)).toBe('{"a":"A","list":[{"a":"A","b":"B"},{"c":"C","d":"D"}],"z":"Z"}')
    })

    it('does not put the indexes of ten items in text order', () => {
      const list = Array.from({ length: 11 }, (_, i) => `item ${i}`)
      expect((sortTree({ list }, byName) as { list: string[] }).list).toEqual(list)
    })
  })

  describe('buildTree', () => {
    it('builds an object for a path of indexes, because a leaf path holds no shape', () => {
      expect(buildTree([
        {
          path: ['list', '0'],
          value: 'A',
        },
        {
          path: ['list', '1'],
          value: 'B',
        },
      ])).toEqual({
        list: { 0: 'A', 1: 'B' },
      })
    })
  })
})

import type { MessageOp, MessageTree } from '../src'
import { describe, expect, it } from 'vitest'
import { applyMessageOps } from '../src'

function set(path: string, value: string, shape?: readonly ('array' | 'object')[]): MessageOp {
  return {
    type: 'set',
    path: path.split('.'),
    value,
    ...shape
      ? { shape }
      : {},
  }
}
function del(path: string): MessageOp {
  return {
    type: 'delete',
    path: path.split('.'),
  }
}

/** JSON text keeps what `toEqual` does not: an array is not an object with the keys 0, 1. */
function run(tree: MessageTree, ...ops: MessageOp[]): string {
  return JSON.stringify(applyMessageOps(tree, ops))
}

describe('applyMessageOps on arrays', () => {
  describe('set', () => {
    it('replaces an item', () => {
      expect(run({
        list: ['A', 'B'],
      }, set('list.1', 'C'))).toBe('{"list":["A","C"]}')
    })

    it('adds an item at the end', () => {
      expect(run({
        list: ['A', 'B'],
      }, set('list.2', 'C'))).toBe('{"list":["A","B","C"]}')
    })

    it('fills the gap with empty items when the index is past the end', () => {
      expect(run({
        list: ['A', 'B'],
      }, set('list.4', 'X'))).toBe('{"list":["A","B","","","X"]}')
    })

    it('sets a message inside an object that is an item', () => {
      expect(run({
        steps: [
          { title: 'S1' },
        ],
      }, set('steps.0.body', 'B'))).toBe('{"steps":[{"title":"S1","body":"B"}]}')
    })

    it('adds an item that is an object', () => {
      expect(run({
        steps: [
          { title: 'S1' },
        ],
      }, set('steps.1.title', 'S2'))).toBe('{"steps":[{"title":"S1"},{"title":"S2"}]}')
    })

    it('does not change the tree it is given', () => {
      const tree = {
        list: ['A'],
      }
      applyMessageOps(tree, [
        set('list.0', 'B'),
        set('list.1', 'C'),
      ])
      expect(tree).toEqual({
        list: ['A'],
      })
    })

    describe('a parent that does not exist yet', () => {
      it('is an array when the shape says so', () => {
        expect(run({}, set('list.0', 'X', ['array']))).toBe('{"list":["X"]}')
      })

      it('is an object when the shape says so', () => {
        expect(run({}, set('menu.open', 'Open', ['object']))).toBe('{"menu":{"open":"Open"}}')
      })

      it('is an object when there is no shape: the path alone does not say it is an array', () => {
        expect(run({}, set('list.0', 'X'))).toBe('{"list":{"0":"X"}}')
      })

      it('takes a shape for each level', () => {
        expect(run({}, set('a.list.1.t', 'x', ['object', 'array', 'object']))).toBe('{"a":{"list":["",{"t":"x"}]}}')
      })

      it('lets an array hold an array', () => {
        expect(run({}, set('m.0.0', 'x', ['array', 'array']))).toBe('{"m":[["x"]]}')
      })

      it('is built once for several messages in it', () => {
        expect(run({}, set('list.0', 'A', ['array']), set('list.1', 'B', ['array']))).toBe('{"list":["A","B"]}')
      })
    })

    describe('a parent that exists', () => {
      it('keeps its own shape, whatever the shape says', () => {
        expect(run({
          list: { 0: 'A' },
        }, set('list.1', 'B', ['array']))).toBe('{"list":{"0":"A","1":"B"}}')
        expect(run({
          list: ['A'],
        }, set('list.1', 'B', ['object']))).toBe('{"list":["A","B"]}')
      })

      it('is replaced by what is built when a message stood there', () => {
        expect(run({ list: 'text' }, set('list.0', 'X', ['array']))).toBe('{"list":["X"]}')
      })

      it('is replaced by an object when a name that is not an index is set in an array', () => {
        // The same as a message that becomes an object: the new path wins.
        expect(run({
          list: ['A'],
        }, set('list.name', 'X'))).toBe('{"list":{"name":"X"}}')
      })
    })

    it('does not read length as an item', () => {
      expect(run({
        list: ['A'],
      }, set('list.length', 'X'))).toBe('{"list":{"length":"X"}}')
    })
  })

  describe('delete', () => {
    it('empties an item in the middle and keeps the others where they are', () => {
      expect(run({
        list: ['A', 'B', 'C'],
      }, del('list.1'))).toBe('{"list":["A","","C"]}')
    })

    it('cuts off the last item', () => {
      expect(run({
        list: ['A', 'B', 'C'],
      }, del('list.2'))).toBe('{"list":["A","B"]}')
    })

    it('cuts off the empty items right before the last one with it', () => {
      expect(run({
        list: ['A', '', 'C'],
      }, del('list.2'))).toBe('{"list":["A"]}')
    })

    it('leaves an empty item that is not next to the end', () => {
      expect(run({
        list: ['', 'B', '', 'D'],
      }, del('list.3'))).toBe('{"list":["","B"]}')
    })

    it('removes the array and the parents left empty when its only item goes', () => {
      expect(run({
        list: ['A'],
      }, del('list.0'))).toBe('{}')
      expect(run({
        a: {
          list: ['A'],
        },
      }, del('a.list.0'))).toBe('{}')
    })

    it('keeps a parent that holds something else', () => {
      expect(run({
        a: {
          list: ['A'],
          b: 'B',
        },
      }, del('a.list.0'))).toBe('{"a":{"b":"B"}}')
    })

    it.each([
      [
        'from the first item',
        ['list.0', 'list.1', 'list.2'],
      ],
      [
        'from the last item',
        ['list.2', 'list.1', 'list.0'],
      ],
      [
        'from the middle',
        ['list.1', 'list.0', 'list.2'],
      ],
    ])('removes the array when every item is deleted one by one, %s', (_name, paths) => {
      expect(run({
        list: ['A', 'B', 'C'],
      }, ...paths.map(del))).toBe('{}')
    })

    it('does nothing for an index past the end', () => {
      expect(run({
        list: ['A', 'B'],
      }, del('list.2'), del('list.9'))).toBe('{"list":["A","B"]}')
    })

    it('does nothing for a name that is not an index', () => {
      expect(run({
        list: ['A'],
      }, del('list.name'), del('list.length'))).toBe('{"list":["A"]}')
    })

    it('does nothing for a path through a message', () => {
      expect(run({
        list: ['A'],
      }, del('list.0.x'))).toBe('{"list":["A"]}')
    })

    describe('a message inside an item that is an object', () => {
      it('removes only that message when the item has others', () => {
        expect(run({
          steps: [
            { title: 'S1', body: 'B1' },
          ],
        }, del('steps.0.body'))).toBe('{"steps":[{"title":"S1"}]}')
      })

      it('cuts the item off when it is the last and nothing is left in it', () => {
        expect(run({
          steps: [
            { title: 'S1' },
            { title: 'S2' },
          ],
        }, del('steps.1.title'))).toBe('{"steps":[{"title":"S1"}]}')
      })

      it('leaves an empty object in the middle so the indexes stay', () => {
        expect(run({
          steps: [
            { title: 'S1' },
            { title: 'S2' },
          ],
        }, del('steps.0.title'))).toBe('{"steps":[{},{"title":"S2"}]}')
      })

      it('removes the array when every message in every item is deleted', () => {
        expect(run({
          steps: [
            { title: 'S1' },
            { title: 'S2' },
          ],
        }, del('steps.0.title'), del('steps.1.title'))).toBe('{}')
      })
    })

    describe('an array inside an array', () => {
      it('removes the inner array and then the item that held it', () => {
        expect(run({
          m: [
            ['a', 'b'],
            ['c'],
          ],
        }, del('m.1.0'))).toBe('{"m":[["a","b"]]}')
      })

      it('empties an inner array in the middle but keeps its place', () => {
        expect(run({
          m: [
            ['a'],
            ['b'],
          ],
        }, del('m.0.0'))).toBe('{"m":[[],["b"]]}')
      })
    })

    it('still removes the parents of an object that are left empty', () => {
      expect(run({
        a: {
          b: { c: 'C' },
        },
        d: 'D',
      }, del('a.b.c'))).toBe('{"d":"D"}')
    })
  })
})

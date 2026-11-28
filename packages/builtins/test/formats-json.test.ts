import type { MessageOp } from '@x18n/core'
import { applyMessageOps, applyTextEdits, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { json } from '../src/formats/json'
import { jsonc } from '../src/formats/jsonc'

const format = json().formats![0]!
const ctx = {
  path: 'locales/en.json',
  locale: 'en',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))
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

const source = `{
  "list": [
    "A",
    { "title": "T" },
    ["x"]
  ],
  "n": "N"
}
`

describe('json format arrays', () => {
  describe('parse', () => {
    it('reads an array as an array, at any depth', () => {
      const { tree } = format.parse(source, ctx)
      expect(JSON.stringify(tree)).toBe('{"list":["A",{"title":"T"},["x"]],"n":"N"}')
    })

    it('reads an empty array as an empty array', () => {
      expect(JSON.stringify(format.parse('{"list": [], "o": {}}', ctx).tree)).toBe('{"list":[],"o":{}}')
    })

    it('reads an object with the keys 0, 1 as an object: the text says which it is', () => {
      const { tree } = format.parse('{"o": {"0": "a", "1": "b"}}', ctx)
      expect(JSON.stringify(tree)).toBe('{"o":{"0":"a","1":"b"}}')
    })

    it('records the range of every item, by its index', () => {
      const { ranges } = format.parse(source, ctx)
      const item = ranges!.get(pathId(['list', '0']))!
      expect(source.slice(item.value.start, item.value.end)).toBe('"A"')
      const title = ranges!.get(pathId(['list', '1', 'title']))!
      expect(source.slice(title.value.start, title.value.end)).toBe('"T"')
      const inner = ranges!.get(pathId(['list', '2', '0']))!
      expect(source.slice(inner.value.start, inner.value.end)).toBe('"x"')
    })

    it('reads an array in a jsonc file with comments', () => {
      const text = '{\n  // list\n  "list": ["A", /* b */ "B"]\n}\n'
      expect(JSON.stringify(jsonc().formats![0]!.parse(text, ctx).tree)).toBe('{"list":["A","B"]}')
    })

    it('still refuses a file whose root is an array', () => {
      expect(() => format.parse('["A"]', ctx)).toThrow()
    })
  })

  describe('serialize', () => {
    it('writes an array as an array', () => {
      const { tree } = format.parse(source, ctx)
      expect(JSON.parse(format.serialize!(tree, ctx))).toEqual(JSON.parse(source))
      expect(format.serialize!(tree, ctx)).toBe(`${JSON.stringify(JSON.parse(source), null, 2)}\n`)
    })

    it('keeps an object an object even when its keys run 0, 1, 2', () => {
      const { tree } = format.parse('{"o": {"0": "a", "1": "b"}, "a": ["a", "b"]}', ctx)
      expect(JSON.parse(format.serialize!(tree, ctx))).toEqual({
        o: { 0: 'a', 1: 'b' },
        a: ['a', 'b'],
      })
      expect(format.serialize!(tree, ctx)).toContain('"o": {')
    })

    it('does not make an array of a tree built without shape', () => {
      const tree = applyMessageOps({}, [
        set('list.0', 'A'),
        set('list.1', 'B'),
      ])
      expect(JSON.parse(format.serialize!(tree, ctx))).toEqual({
        list: { 0: 'A', 1: 'B' },
      })
    })

    it('makes an array of a tree built with the shape', () => {
      const tree = applyMessageOps({}, [
        set('list.0', 'A', ['array']),
        set('list.1', 'B', ['array']),
      ])
      expect(JSON.parse(format.serialize!(tree, ctx))).toEqual({
        list: ['A', 'B'],
      })
    })

    it('writes an empty array and an emptied item', () => {
      const text = format.serialize!({
        list: [],
        other: ['A', '', 'C'],
      }, ctx)
      expect(JSON.parse(text)).toEqual({
        list: [],
        other: ['A', '', 'C'],
      })
    })

    it('indents with the file indent', () => {
      expect(format.serialize!({
        list: ['A'],
      }, { ...ctx, indent: 'tab' })).toBe('{\n\t"list": [\n\t\t"A"\n\t]\n}\n')
    })
  })
})

describe('json format edit: set', () => {
  it('sets an item and a message in an item in place', () => {
    expect(edit(source, [
      set('list.0', 'B'),
      set('list.1.title', 'U'),
    ])).toBe(source.replace('"A"', '"B"').replace('"T"', '"U"'))
  })

  it('appends an item at the end of an array', () => {
    const next = edit(source, [
      set('list.3', 'D'),
    ])
    expect(JSON.parse(next).list).toEqual([
      'A',
      { title: 'T' },
      ['x'],
      'D',
    ])
    expect(next).toContain('"n": "N"')
  })

  it('fills the gap with empty items when the index is past the end', () => {
    expect(JSON.parse(edit(source, [
      set('list.5', 'F'),
    ])).list).toEqual([
      'A',
      { title: 'T' },
      ['x'],
      '',
      '',
      'F',
    ])
  })

  it('adds an item to an empty array', () => {
    expect(JSON.parse(edit('{"list": []}', [
      set('list.0', 'A'),
    ])).list).toEqual(['A'])
  })

  it('adds a message to an object that is an item', () => {
    expect(JSON.parse(edit(source, [
      set('list.1.body', 'B'),
    ])).list[1]).toEqual({ title: 'T', body: 'B' })
  })

  it('keeps an array written on one line on one line', () => {
    expect(edit('{"list": ["a", "b"]}', [
      set('list.2', 'c'),
    ])).toBe('{"list": ["a", "b", "c"]}')
  })

  it('keeps the comments of a jsonc file', () => {
    const text = [
      '{',
      '  // the list',
      '  "list": [',
      '    "A" // first',
      '  ]',
      '}',
      '',
    ].join('\n')
    const next = applyTextEdits(text, jsonc().formats![0]!.edit!(text, [
      set('list.1', 'B'),
    ], ctx))
    expect(next).toContain('// the list')
    expect(next).toContain('"A", // first')
    expect(next).toContain('"B"')
  })

  describe('a key that is not in the file yet', () => {
    it('is an array when the shape says so', () => {
      const next = edit(source, [
        set('more.0', 'M0', ['array']),
        set('more.1', 'M1', ['array']),
      ])
      expect(JSON.stringify(JSON.parse(next).more)).toBe('["M0","M1"]')
    })

    it('is an object when there is no shape: the path alone does not say it is an array', () => {
      const next = edit(source, [
        set('more.0', 'M0'),
        set('more.1', 'M1'),
      ])
      expect(JSON.stringify(JSON.parse(next).more)).toBe('{"0":"M0","1":"M1"}')
    })

    it('is an array of objects when the shape says so for each level', () => {
      const next = edit(source, [
        set('steps.1.title', 'S1', ['array', 'object']),
      ])
      expect(JSON.stringify(JSON.parse(next).steps)).toBe('["",{"title":"S1"}]')
    })

    it('is an array in an array', () => {
      expect(JSON.stringify(JSON.parse(edit(source, [
        set('m.0.0', 'x', ['array', 'array']),
      ])).m)).toBe('[["x"]]')
    })

    it('sits in the new array of a file that is empty', () => {
      expect(JSON.stringify(JSON.parse(edit('', [
        set('list.0', 'A', ['array']),
      ])))).toBe('{"list":["A"]}')
    })
  })

  describe('a parent that is in the file', () => {
    it('keeps the shape the file has, whatever the shape says', () => {
      const next = edit('{"o": {"0": "a"}, "a": ["x"]}', [
        set('o.1', 'b', ['array']),
        set('a.1', 'y', ['object']),
      ])
      expect(JSON.stringify(JSON.parse(next))).toBe('{"o":{"0":"a","1":"b"},"a":["x","y"]}')
    })

    it('is replaced by an object when a name that is not an index is set in an array', () => {
      expect(JSON.stringify(JSON.parse(edit('{"list": ["A"], "n": "N"}', [
        set('list.name', 'X'),
      ])))).toBe('{"list":{"name":"X"},"n":"N"}')
    })

    it('becomes an array when a message stood there and the shape says so', () => {
      expect(JSON.stringify(JSON.parse(edit('{"list": "text"}', [
        set('list.0', 'A', ['array']),
      ])))).toBe('{"list":["A"]}')
    })
  })
})

describe('json format edit: delete', () => {
  /** What the tree operations make of the same ops. The text and the tree have to agree. */
  function sameAsTree(text: string, ...ops: MessageOp[]): string {
    const next = edit(text, ops)
    const tree = applyMessageOps(format.parse(text, ctx).tree, ops)
    expect(JSON.stringify(format.parse(next, ctx).tree)).toBe(JSON.stringify(tree))
    return next
  }

  const list = '{\n  "list": [\n    "A",\n    "B",\n    "C"\n  ],\n  "n": "N"\n}\n'

  it('empties an item in the middle and leaves every other byte', () => {
    expect(sameAsTree(list, del('list.1'))).toBe(list.replace('"B"', '""'))
  })

  it('cuts off the last item and fixes the commas', () => {
    expect(sameAsTree(list, del('list.2'))).toBe('{\n  "list": [\n    "A",\n    "B"\n  ],\n  "n": "N"\n}\n')
  })

  it('cuts off the empty items right before the last one with it', () => {
    const text = list.replace('"B"', '""')
    expect(sameAsTree(text, del('list.2'))).toBe('{\n  "list": [\n    "A"\n  ],\n  "n": "N"\n}\n')
  })

  it('stops at the first item that holds a message', () => {
    const text = '{"list": ["", "B", "", "D"]}'
    expect(sameAsTree(text, del('list.3'))).toBe('{"list": ["", "B"]}')
  })

  it('does not take an empty item that is not next to the end', () => {
    expect(sameAsTree('{"list": ["", "", "C", "D"]}', del('list.3'))).toBe('{"list": ["", "", "C"]}')
  })

  it('cuts off an array written on one line', () => {
    expect(sameAsTree('{"list": ["A", "B", "C"]}', del('list.2'))).toBe('{"list": ["A", "B"]}')
  })

  it('removes the whole array when its only item goes, and the comma before it', () => {
    expect(sameAsTree('{\n  "n": "N",\n  "list": [\n    "A"\n  ]\n}\n', del('list.0'))).toBe('{\n  "n": "N"\n}\n')
  })

  it('removes the whole array in the middle of an object', () => {
    expect(sameAsTree('{\n  "a": "1",\n  "list": ["A"],\n  "z": "2"\n}\n', del('list.0'))).toBe('{\n  "a": "1",\n  "z": "2"\n}\n')
  })

  it('leaves an empty object when the array was all an object held', () => {
    expect(sameAsTree('{"list": ["A"]}', del('list.0'))).toBe('{}')
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
    expect(sameAsTree('{"a": "1", "list": ["A", "B", "C"]}', ...paths.map(del))).toBe('{"a": "1"}')
  })

  it('does nothing for an index past the end or a name that is not an index', () => {
    expect(sameAsTree(list, del('list.3'), del('list.9'), del('list.name'), del('list.length'))).toBe(list)
  })

  it('does nothing for a path through a message', () => {
    expect(sameAsTree(list, del('list.0.x'))).toBe(list)
  })

  describe('a message inside an item that is an object', () => {
    const steps = '{"steps": [{"title": "S1", "body": "B1"}, {"title": "S2"}]}'

    it('removes only that message when the item has others', () => {
      expect(sameAsTree(steps, del('steps.0.body'))).toBe('{"steps": [{"title": "S1"}, {"title": "S2"}]}')
    })

    it('cuts the item off when it is the last and nothing is left in it', () => {
      expect(sameAsTree(steps, del('steps.1.title'))).toBe('{"steps": [{"title": "S1", "body": "B1"}]}')
    })

    it('leaves an empty object in the middle so the indexes stay', () => {
      expect(sameAsTree('{"steps": [{"title": "S1"}, {"title": "S2"}]}', del('steps.0.title'))).toBe('{"steps": [{}, {"title": "S2"}]}')
    })

    it('removes the array when every message in every item is deleted', () => {
      expect(sameAsTree('{"steps": [{"title": "S1"}, {"title": "S2"}]}', del('steps.0.title'), del('steps.1.title'))).toBe('{}')
    })
  })

  describe('an array inside an array', () => {
    it('removes the inner array and then the item that held it', () => {
      expect(sameAsTree('{"m": [["a", "b"], ["c"]]}', del('m.1.0'))).toBe('{"m": [["a", "b"]]}')
    })

    it('empties an inner array in the middle but keeps its place', () => {
      expect(sameAsTree('{"m": [["a"], ["b"]]}', del('m.0.0'))).toBe('{"m": [[], ["b"]]}')
    })
  })

  it('keeps the comments of a jsonc file around the items that stay', () => {
    const text = [
      '{',
      '  "list": [',
      '    "A", // first',
      '    "B", // second',
      '    "C" // third',
      '  ]',
      '}',
      '',
    ].join('\n')
    const next = applyTextEdits(text, jsonc().formats![0]!.edit!(text, [
      del('list.2'),
    ], ctx))
    expect(next).toBe([
      '{',
      '  "list": [',
      '    "A", // first',
      '    "B" // second',
      '  ]',
      '}',
      '',
    ].join('\n'))
  })
})

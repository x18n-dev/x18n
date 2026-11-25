import type { EditOp } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const modes = [
  ['in place', {}],
  [
    'written in full',
    {
      write: { sort: 'binary' },
    },
  ],
] as const

const en = {
  home: {
    list: ['A', 'B'],
    t: 'T',
  },
  list: ['x', 'y'],
  n: 'N',
}
const de = {
  home: {
    list: ['a', 'b'],
  },
}

function component(script: string): string {
  return `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`
}

describe.each(modes)('adding and renaming around arrays, files %s', (_name, base) => {
  async function open(script: string, messages: object = en) {
    return createTestProject({
      'package.json': json({
        dependencies: { 'vue-i18n': '*', 'vue': '*' },
      }),
      'src/locales/en.json': json(messages),
      'src/locales/de.json': json(de),
      'src/A.vue': component(script),
    }, base as never)
  }

  type Opened = Awaited<ReturnType<typeof open>>
  const data = (opened: Opened, locale = 'en'): unknown => JSON.parse(opened.files.get(`src/locales/${locale}.json`)!)

  async function apply({ project }: Opened, ops: EditOp[]): Promise<readonly string[]> {
    const plan = project.plan(ops)
    await project.apply(plan)
    return plan.warnings
  }

  const rename = (from: string, to: string): EditOp => ({ type: 'rename', from, to })
  const renamePrefix = (from: string, to: string): EditOp => ({ type: 'rename-prefix', from, to })
  const set = (key: string, value: string, replace?: boolean): EditOp => ({
    type: 'set',
    key,
    locale: 'en',
    value,
    ...replace === undefined
      ? {}
      : { replace },
  })

  describe('adding a key whose name is not an index to an array', () => {
    it('is skipped by the fix of a missing key, and the array stays', async () => {
      const opened = await open('t(\'list.foo\')')
      const [diagnostic] = opened.project.analyze().diagnostics.filter(d => d.code === 'missing-key')
      expect(await apply(opened, diagnostic!.fixes[0]!.ops as EditOp[])).toEqual([
        expect.stringContaining('"list.foo" is not added'),
      ])
      expect(data(opened)).toEqual(en)
    })

    it.each([true, false])('is skipped by a set with replace %s too, as it would replace the whole array', async (replace) => {
      const opened = await open('tm(\'list\')')
      expect(await apply(opened, [
        set('list.foo', 'x', replace),
      ])).toEqual([
        expect.stringContaining('is not added'),
      ])
      expect(data(opened)).toEqual(en)
    })

    it('does not stop a name next to an array', async () => {
      const opened = await open('tm(\'list\')')
      expect(await apply(opened, [
        set('home.added', 'x'),
      ])).toEqual([])
      expect(data(opened)).toEqual({
        ...en,
        home: { ...en.home, added: 'x' },
      })
    })
  })

  describe('renaming an item of an array', () => {
    // An item is deleted from its place, by the delete rule, and added where it goes, by the add rule.
    it.each([
      ['to a name', 'home.list.0', 'home.list.first'],
      ['to an index past the end', 'list.0', 'list.5'],
      ['to an index far past the end', 'list.0', 'list.7'],
    ])('is refused %s, and no file is touched', async (_why, from, to) => {
      const opened = await open('tm(\'list\')\ntm(\'home.list\')')
      const before = opened.files.get('src/locales/en.json')
      expect(() => opened.project.plan([
        rename(from, to),
      ])).toThrow(/array/)
      expect(opened.files.get('src/locales/en.json')).toBe(before)
    })

    it('moves out of the array: the place is emptied, as when the item is deleted', async () => {
      const opened = await open('tm(\'list\')\ntm(\'home.list\')\nt(\'home.t\')')
      expect(await apply(opened, [
        rename('home.list.0', 'home.other'),
      ])).toEqual([])
      expect(data(opened)).toEqual({
        ...en,
        home: {
          list: ['', 'B'],
          t: 'T',
          other: 'A',
        },
      })
    })

    it('moves to the end of the array, right after the last item', async () => {
      const opened = await open('tm(\'list\')')
      expect(await apply(opened, [
        rename('list.0', 'list.2'),
      ])).toEqual([])
      expect((data(opened) as { list: string[] }).list).toEqual(['', 'y', 'x'])
    })

    it('moves the last item out and cuts the array off', async () => {
      const opened = await open('tm(\'list\')')
      await apply(opened, [
        rename('list.1', 'moved'),
      ])
      expect(data(opened)).toEqual({
        ...en,
        list: ['x'],
        moved: 'y',
      })
    })

    it('rewrites the usage in the code', async () => {
      const opened = await open('t(\'list[0]\')\ntm(\'home.list\')\nt(\'list[1]\')')
      await apply(opened, [
        rename('list.0', 'list.2'),
      ])
      expect(opened.files.get('src/A.vue')).toContain('t(\'list.2\')')
    })

    describe('an item that is an object', () => {
      const steps = {
        steps: [
          { title: 'S1' },
          { title: 'S2' },
        ],
      }

      it('is refused to a name', async () => {
        const opened = await open('tm(\'steps\')', steps)
        expect(() => opened.project.plan([
          renamePrefix('steps.0', 'steps.first'),
        ])).toThrow(/array/)
      })

      it('moves to the end of the array, and leaves an empty object where it was', async () => {
        const opened = await open('tm(\'steps\')', steps)
        await apply(opened, [
          renamePrefix('steps.0', 'steps.2'),
        ])
        expect(data(opened)).toEqual({
          steps: [
            {},
            { title: 'S2' },
            { title: 'S1' },
          ],
        })
      })

      it('renames a message inside an item in place', async () => {
        const opened = await open('tm(\'steps\')', steps)
        await apply(opened, [
          rename('steps.1.title', 'steps.1.name'),
        ])
        expect(data(opened)).toEqual({
          steps: [
            { title: 'S1' },
            { name: 'S2' },
          ],
        })
      })
    })
  })

  describe('renaming a key to a place in an array', () => {
    it('appends right after the last item', async () => {
      const opened = await open('tm(\'list\')\nt(\'n\')')
      expect(await apply(opened, [
        rename('n', 'list.2'),
      ])).toEqual([])
      expect((data(opened) as { list: string[] }).list).toEqual(['x', 'y', 'N'])
    })

    it.each([
      ['a name that is not an index', 'list.foo'],
      ['an index past the end', 'list.9'],
      ['an index far past the end', 'list.99999999'],
    ])('is refused for %s, as it would replace the array or leave a gap', async (_why, to) => {
      const opened = await open('tm(\'list\')\nt(\'n\')')
      const before = opened.files.get('src/locales/en.json')
      expect(() => opened.project.plan([
        rename('n', to),
      ])).toThrow(/array/)
      expect(opened.files.get('src/locales/en.json')).toBe(before)
    })
  })

  describe('renaming a node that holds an array', () => {
    const script = 'tm(\'home.list\')\nt(\'home.t\')\ntm(\'list\')\nt(\'n\')'

    it('keeps the array when only the last name changes', async () => {
      const opened = await open(script)
      await apply(opened, [
        renamePrefix('home', 'start'),
      ])
      expect(data(opened)).toEqual({ ...en, home: undefined, start: en.home })
      expect(data(opened, 'de')).toEqual({ start: de.home })
    })

    it('keeps the array when the node moves deeper', async () => {
      const opened = await open(script)
      await apply(opened, [
        renamePrefix('home', 'a.b'),
      ])
      expect(data(opened)).toEqual({
        list: en.list,
        n: 'N',
        a: { b: en.home },
      })
      expect(data(opened, 'de')).toEqual({
        a: { b: de.home },
      })
    })

    it('keeps the array when the node moves to another parent and name', async () => {
      const opened = await open(script)
      await apply(opened, [
        rename('home.list', 'other.items'),
      ])
      expect((data(opened) as { other: { items: string[] } }).other.items).toEqual(['A', 'B'])
      expect((data(opened) as { home: object }).home).toEqual({ t: 'T' })
    })

    it('keeps every item of a long array, in order', async () => {
      const list = Array.from({ length: 12 }, (_, i) => `item ${i}`)
      const opened = await open('tm(\'home.list\')', {
        home: { list },
      })
      await apply(opened, [
        renamePrefix('home', 'a.b'),
      ])
      expect(data(opened)).toEqual({
        a: {
          b: { list },
        },
      })
    })

    it('rewrites the usages in the code', async () => {
      const opened = await open('tm(\'home.list\')\nt(\'home.list[0]\')\nt(\'home.t\')\ntm(\'list\')\nt(\'n\')')
      await apply(opened, [
        renamePrefix('home', 'a.b'),
      ])
      expect(opened.files.get('src/A.vue')).toContain('tm(\'a.b.list\')')
      expect(opened.files.get('src/A.vue')).toContain('t(\'a.b.list.0\')')
    })
  })
})

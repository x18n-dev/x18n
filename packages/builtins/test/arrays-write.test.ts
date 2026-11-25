import type { EditOp } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const pkg = json({
  dependencies: { 'vue-i18n': '*', 'vue': '*' },
})

function component(script: string): string {
  return `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`
}

/** A file is edited in place, or written in full (sorted), which goes through `serialize`. */
const modes = [
  ['in place', {}],
  [
    'written in full',
    {
      write: { sort: 'binary' },
    },
  ],
] as const

type Config = NonNullable<Parameters<typeof createTestProject>[1]>

async function openWith(base: Config, files: Record<string, string>, config: Config = {}) {
  return createTestProject({ 'package.json': pkg, ...files }, {
    ...base,
    ...config,
  })
}

type Opened = Awaited<ReturnType<typeof openWith>>

async function deleteUnused({ project }: Opened): Promise<string[]> {
  const deletion = project.planUnused()
  await project.apply(deletion.plan)
  return deletion.keys.map(k => k.key)
}

async function write({ project }: Opened, ops: EditOp[]): Promise<readonly string[]> {
  const plan = project.plan(ops)
  await project.apply(plan, {
    answers: Object.fromEntries(plan.decisions.map(d => [d.id, d.default])),
  })
  return plan.warnings
}

const set = (key: string, locale: string, value: string): EditOp => ({ type: 'set', key, locale, value })

/** The file as data: `toEqual` tells an array from an object, and ignores the order of keys. */
const read = (opened: Opened, path: string): unknown => JSON.parse(opened.files.get(path)!)

describe.each(modes)('arrays, files %s', (_name, base) => {
  const open = (files: Record<string, string>, config: Config = {}): Promise<Opened> => openWith(base, files, config)
  const inPlace = Object.keys(base).length === 0

  describe('delete Unused Keys on an array', () => {
    const en = json({
      list: ['A', 'B', 'C'],
      n: 'N',
    })

    it.runIf(inPlace)('empties an item in the middle and leaves every other byte', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/A.vue': component('t(\'list[0]\')\nt(\'list[2]\')\nt(\'n\')'),
      })
      expect(await deleteUnused(opened)).toEqual(['list.1'])
      expect(opened.files.get('src/locales/en.json')).toBe(en.replace('"B"', '""'))
    })

    it('converges: the emptied item is planned again and changes nothing', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/A.vue': component('t(\'list[0]\')\nt(\'list[2]\')\nt(\'n\')'),
      })
      await deleteUnused(opened)
      const once = opened.files.get('src/locales/en.json')
      await deleteUnused(opened)
      expect(opened.files.get('src/locales/en.json')).toBe(once)
    })

    it('cuts the items off the end', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/A.vue': component('t(\'list[0]\')\nt(\'n\')'),
      })
      expect(await deleteUnused(opened)).toEqual(['list.1', 'list.2'])
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"list":["A"],"n":"N"}'))
    })

    it('takes the empty item next to the end with the last one', async () => {
      const opened = await open({
        'src/locales/en.json': json({
          list: ['A', '', 'C'],
          n: 'N',
        }),
        'src/A.vue': component('t(\'list[0]\')\nt(\'n\')'),
      })
      await deleteUnused(opened)
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"list":["A"],"n":"N"}'))
    })

    it('removes the array when nothing in it is used', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/A.vue': component('t(\'n\')'),
      })
      await deleteUnused(opened)
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"n":"N"}'))
    })

    it('deletes nothing from an array that tm() reads', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/A.vue': component('tm(\'list\')\nt(\'n\')'),
      })
      expect(await deleteUnused(opened)).toEqual([])
      expect(opened.files.get('src/locales/en.json')).toBe(en)
    })

    it('cuts off an item that is an object when nothing in it is used', async () => {
      const opened = await open({
        'src/locales/en.json': json({
          steps: [
            { title: 'S1' },
            { title: 'S2' },
          ],
        }),
        'src/A.vue': component('tm(\'steps[0]\')'),
      })
      expect(await deleteUnused(opened)).toEqual(['steps.1.title'])
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"steps":[{"title":"S1"}]}'))
    })

    it('treats every locale the same, and leaves a shorter one alone', async () => {
      const opened = await open({
        'src/locales/en.json': en,
        'src/locales/de.json': json({
          list: ['a', 'b'],
        }),
        'src/A.vue': component('t(\'list[0]\')\nt(\'n\')'),
      })
      await deleteUnused(opened)
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"list":["A"],"n":"N"}'))
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"list":["a"]}'))
    })
  })

  describe('adding a message to an array in a locale', () => {
    const files = {
      'src/locales/en.json': json({
        list: ['A', 'B'],
        steps: [
          { title: 'S1' },
          { title: 'S2' },
        ],
        n: 'N',
      }),
      'src/locales/de.json': json({ n: 'N-de' }),
      'src/A.vue': component('tm(\'list\')\ntm(\'steps\')\nt(\'n\')'),
    }

    it('builds an array where the source has one', async () => {
      const opened = await open(files)
      await write(opened, [
        set('list.0', 'de', 'a'),
        set('list.1', 'de', 'b'),
      ])
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"n":"N-de","list":["a","b"]}'))
    })

    it('adds an item right after the last one', async () => {
      const opened = await open({
        ...files,
        'src/locales/de.json': json({
          list: ['a'],
        }),
      })
      expect(await write(opened, [
        set('list.1', 'de', 'b'),
      ])).toEqual([])
      expect(read(opened, 'src/locales/de.json')).toEqual({
        list: ['a', 'b'],
      })
    })

    describe('an item that would leave a gap', () => {
      it('is not added to an array that is not in the file yet, as the first item has to come first', async () => {
        const opened = await open(files)
        const before = opened.files.get('src/locales/de.json')
        expect(await write(opened, [
          set('list.1', 'de', 'b'),
        ])).toEqual([
          expect.stringContaining('"list.1" is not added'),
        ])
        expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse(before!))
      })

      it('is not added far past the end of an array that has one item', async () => {
        const opened = await open({
          ...files,
          'src/locales/de.json': json({
            list: ['a'],
          }),
        })
        const before = opened.files.get('src/locales/de.json')
        expect(await write(opened, [
          set('list.99999999', 'de', 'x'),
        ])).toEqual([
          expect.stringContaining('"list.99999999" is not added'),
        ])
        expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse(before!))
      })

      it('is not added to the array of the source locale either', async () => {
        const opened = await open(files)
        const before = opened.files.get('src/locales/en.json')
        expect(await write(opened, [
          set('list.9', 'en', 'x'),
        ])).toHaveLength(1)
        expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse(before!))
      })

      it('is not added to an array of objects', async () => {
        const opened = await open({
          ...files,
          'src/locales/de.json': json({
            steps: [
              { title: 's1' },
            ],
          }),
        })
        expect(await write(opened, [
          set('steps.2.title', 'de', 'x'),
        ])).toHaveLength(1)
        expect(read(opened, 'src/locales/de.json')).toEqual({
          steps: [
            { title: 's1' },
          ],
        })
      })

      it('is not added to an array in an array, and the item after the last one is', async () => {
        const opened = await open({
          'src/locales/en.json': json({
            m: [
              ['a', 'b'],
              ['c'],
            ],
          }),
          'src/locales/de.json': json({
            m: [
              ['x'],
            ],
          }),
          'src/A.vue': component('tm(\'m\')'),
        })
        expect(await write(opened, [
          set('m.0.2', 'de', 'gap'),
        ])).toHaveLength(1)
        expect(await write(opened, [
          set('m.0.1', 'de', 'y'),
          set('m.1.0', 'de', 'z'),
        ])).toEqual([])
        expect(read(opened, 'src/locales/de.json')).toEqual({
          m: [
            ['x', 'y'],
            ['z'],
          ],
        })
      })

      it('plans no change to the file, so nothing is rewritten or re-sorted', async () => {
        const opened = await open({
          ...files,
          'src/locales/de.json': json({
            n: 'N-de',
            list: ['a'],
          }),
        })
        const plan = opened.project.plan([
          set('list.99999999', 'de', 'x'),
        ])
        expect(plan.warnings).toHaveLength(1)
        expect(plan.changes).toEqual([])
      })

      it('does not stop an object with numeric keys: it has no gap', async () => {
        const opened = await open({
          ...files,
          'src/locales/de.json': json({
            list: { 0: 'a' },
          }),
        })
        expect(await write(opened, [
          set('list.5', 'de', 'x'),
        ])).toEqual([])
        expect(read(opened, 'src/locales/de.json')).toEqual({
          list: { 0: 'a', 5: 'x' },
        })
      })

      it('does not stop the others in the same plan', async () => {
        const opened = await open(files)
        expect(await write(opened, [
          set('list.1', 'de', 'b'),
          set('n', 'de', 'N2'),
        ])).toHaveLength(1)
        expect(read(opened, 'src/locales/de.json')).toEqual({ n: 'N2' })
      })
    })

    it('builds an array of objects where the source has one', async () => {
      const opened = await open(files)
      await write(opened, [
        set('steps.0.title', 'de', 's1'),
        set('steps.1.title', 'de', 's2'),
      ])
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"n":"N-de","steps":[{"title":"s1"},{"title":"s2"}]}'))
    })

    it('writes the array into a file that is created', async () => {
      const opened = await open(files)
      await write(opened, [
        set('list.0', 'fr', 'a'),
        set('list.1', 'fr', 'b'),
      ])
      expect(read(opened, 'src/locales/fr.json')).toEqual(JSON.parse('{"list":["a","b"]}'))
    })

    it('builds an object for a key the source does not have: the path alone does not say it is an array', async () => {
      const opened = await open(files)
      await write(opened, [
        set('fresh.0', 'de', 'x'),
      ])
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"n":"N-de","fresh":{"0":"x"}}'))
    })

    it('keeps the shape of the file when it already has the key as an object', async () => {
      const opened = await open({
        ...files,
        'src/locales/de.json': json({
          list: { 0: 'a' },
        }),
      })
      await write(opened, [
        set('list.1', 'de', 'b'),
      ])
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"list":{"0":"a","1":"b"}}'))
    })

    it('adds an item to the array of the source locale itself', async () => {
      const opened = await open(files)
      await write(opened, [
        set('list.2', 'en', 'C'),
      ])
      expect(JSON.parse(opened.files.get('src/locales/en.json')!).list).toEqual(['A', 'B', 'C'])
    })
  })

  describe('sorting a file that holds an array', () => {
    it('sorts the keys and keeps the order of the items', async () => {
      const opened = await open({
        'src/locales/en.json': json({
          z: 'Z',
          list: ['b', 'a', 'c'],
          a: 'A',
        }),
        'src/A.vue': component('tm(\'list\')\nt(\'z\')\nt(\'a\')'),
      }, {
        write: { sort: 'binary' },
      })
      await write(opened, [
        set('z', 'en', 'Z2'),
      ])
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"a":"A","list":["b","a","c"],"z":"Z2"}'))
    })
  })

  describe('renaming a parent that holds an array', () => {
    it('renames it in the files and in the code, and keeps the array', async () => {
      const opened = await open({
        'src/locales/en.json': json({
          home: {
            list: ['A', 'B'],
            t: 'T',
          },
        }),
        'src/locales/de.json': json({
          home: {
            list: ['a', 'b'],
          },
        }),
        'src/A.vue': component('tm(\'home.list\')\nt(\'home.list[0]\')\nt(\'home.t\')'),
      })
      await write(opened, [
        { type: 'rename-prefix', from: 'home', to: 'start' },
      ])
      expect(read(opened, 'src/locales/en.json')).toEqual(JSON.parse('{"start":{"list":["A","B"],"t":"T"}}'))
      expect(read(opened, 'src/locales/de.json')).toEqual(JSON.parse('{"start":{"list":["a","b"]}}'))
      expect(opened.files.get('src/A.vue')).toContain('tm(\'start.list\')')
      expect(opened.files.get('src/A.vue')).toContain('t(\'start.list.0\')')
    })
  })
})

/**
 * The fix that a `missing-key` diagnostic carries. An editor applies it with `project.plan(fix.ops)` (a quick fix), and
 * `x18n check --fix` with `project.planFixes`. It sets the key with `replace: false`, which is another branch than a plain set.
 */
describe.each(modes)('the missing-key fix on an array, files %s', (_name, base) => {
  const en = json({
    list: ['A', 'B'],
    n: 'N',
  })
  const open = (script: string): Promise<Opened> => openWith(base, {
    'src/locales/en.json': en,
    'src/A.vue': component(script),
  })

  const missingKeys = ({ project }: Opened): ReturnType<Opened['project']['analyze']>['diagnostics'] =>
    project.analyze().diagnostics.filter(d => d.code === 'missing-key')

  async function quickFix(opened: Opened): Promise<readonly string[]> {
    const warnings: string[] = []
    for (const d of missingKeys(opened)) {
      const plan = opened.project.plan(d.fixes[0]!.ops)
      warnings.push(...plan.warnings)
      await opened.project.apply(plan)
    }
    return warnings
  }

  async function checkFix(opened: Opened): Promise<readonly string[]> {
    const { plan } = opened.project.planFixes(missingKeys(opened))
    await opened.project.apply(plan)
    return plan.warnings
  }

  describe.each([
    ['the quick fix of an editor', quickFix],
    ['x18n check --fix', checkFix],
  ] as const)('%s', (_how, fix) => {
    it('adds the item right after the last one', async () => {
      const opened = await open('t(\'list[2]\')')
      expect(await fix(opened)).toEqual([])
      expect(read(opened, 'src/locales/en.json')).toEqual({
        list: ['A', 'B', ''],
        n: 'N',
      })
    })

    it('adds the item written as list.2 too', async () => {
      const opened = await open('t(\'list.2\')')
      expect(await fix(opened)).toEqual([])
      expect(read(opened, 'src/locales/en.json')).toEqual({
        list: ['A', 'B', ''],
        n: 'N',
      })
    })

    it.each(['list[3]', 'list[9]', 'list[99999999]'])('skips %s with a warning and leaves the file as it is', async (key) => {
      const opened = await open(`t('${key}')`)
      expect(await fix(opened)).toEqual([
        expect.stringContaining('is not added'),
      ])
      expect(read(opened, 'src/locales/en.json')).toEqual({
        list: ['A', 'B'],
        n: 'N',
      })
    })

    it('adds the one that fits and skips the one that does not, in the same run', async () => {
      const opened = await open('t(\'list[2]\')\nt(\'list[9]\')')
      expect(await fix(opened)).toHaveLength(1)
      expect(read(opened, 'src/locales/en.json')).toEqual({
        list: ['A', 'B', ''],
        n: 'N',
      })
    })
  })
})

import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const messages = {
  list: ['A', 'B'],
  menu: { open: 'Open' },
  menus: { all: 'All' },
  title: 'T',
  other: { x: 'X' },
}

async function unusedWith(code: string, deps: Record<string, string> = { 'i18next': '*', 'react-i18next': '*' }, config: Parameters<typeof createTestProject>[1] = {}, data: object = messages): Promise<string[]> {
  const { project } = await createTestProject({
    'package.json': json({ dependencies: deps }),
    'locales/en/translation.json': json(data),
    'src/App.tsx': code,
  }, {
    resources: [
      { pattern: 'locales/{locale}/{namespaces}.json' },
    ],
    ...config,
  })
  return project.analyze().unused.map(key => key.replace('translation:', ''))
}

// Everything else is read, so the list shows what the call under test leaves unused.
const rest = 'useTranslation()\nt(\'title\')\nt(\'menus.all\')\nt(\'other.x\')\n'
const head = 'const { t } = '

describe('a call that takes the subtree when an option is true', () => {
  describe('i18next returnObjects', () => {
    it('counts the items of an array as used', async () => {
      expect(await unusedWith(`${head}${rest}t('list', { returnObjects: true })\nt('menu.open')`)).toEqual([])
    })

    it('counts the children of an object as used', async () => {
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', { returnObjects: true })`)).toEqual([])
    })

    it('counts the subtree when the options come after a default value', async () => {
      expect(await unusedWith(`${head}${rest}t('list', 'default', { returnObjects: true })\nt('menu.open')`)).toEqual([])
    })

    it('reads the function of useTranslation and of getFixedT', async () => {
      const code = `${head}${rest}const fixed = i18next.getFixedT('en')\nfixed('list', { returnObjects: true })\nt('menu.open')`
      expect(await unusedWith(code)).toEqual([])
    })

    it('counts nothing below an object without the option', async () => {
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu')`)).toEqual(['menu.open'])
    })

    it('counts nothing below an object when the option is false, or has no value that counts', async () => {
      for (const value of ['false', 'null', '0', 'undefined'])
        expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', { returnObjects: ${value} })`)).toEqual(['menu.open'])
    })

    // The call names the option but x18n cannot read its value: it may be true, and a key that is kept is safer than one that is deleted.
    it.each([
      ['a variable', '{ returnObjects: flag }'],
      ['a shorthand property', '{ returnObjects }'],
      ['an expression', '{ returnObjects: props.flat || mode === \'all\' }'],
    ])('counts the children of an object when the value is %s', async (_why, options) => {
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', ${options})`)).toEqual([])
    })

    it('counts nothing when the call does not name the option, even with options it cannot read', async () => {
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', { ...opts })`)).toEqual(['menu.open'])
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', { count: n })`)).toEqual(['menu.open'])
      expect(await unusedWith(`${head}${rest}t('list.0')\nt('list.1')\nt('menu', options)`)).toEqual(['menu.open'])
    })

    it('counts what is below a parent object, arrays in it too, when the option may be true', async () => {
      const data = {
        home: {
          list: ['A', 'B'],
          menu: { open: 'Open' },
          t: 'T',
        },
        gone: 'Gone',
      }
      expect(await unusedWith(`${head}useTranslation()\nt('home', { returnObjects: flag })`, undefined, {}, data)).toEqual(['gone'])
    })

    it('does not reach a sibling that shares the start of the name', async () => {
      const code = `${head}${rest}t('menu', { returnObjects: true })\nt('list.0')\nt('list.1')`
      expect(await unusedWith(code)).toEqual([])
      expect(await unusedWith(`${head}${rest.replace('t(\'menus.all\')\n', '')}t('menu', { returnObjects: true })\nt('list.0')\nt('list.1')`)).toEqual(['menus.all'])
    })

    it('is not planned for deletion', async () => {
      const { project } = await createTestProject({
        'package.json': json({
          dependencies: { i18next: '*' },
        }),
        'locales/en/translation.json': json({
          list: ['A', 'B'],
          gone: 'Gone',
        }),
        'src/App.ts': 'import i18next from \'i18next\'\ni18next.t(\'list\', { returnObjects: true })\n',
      }, {
        resources: [
          { pattern: 'locales/{locale}/{namespaces}.json' },
        ],
      })
      expect(project.planUnused().keys.map(k => k.key)).toEqual(['translation:gone'])
    })
  })

  describe('a call written in the config', () => {
    const calls = (subtree: unknown): Parameters<typeof createTestProject>[1] => ({
      usage: {
        calls: [
          {
            callee: 'tt',
            params: {
              arg: 1,
              options: ['all'],
            },
            subtree,
          },
        ],
      },
    } as never)

    it('takes the subtree when the named option is true', async () => {
      const code = `${head}${rest}tt('list', { all: true })\ntt('menu.open')`
      expect(await unusedWith(code, { i18next: '*' }, calls({ option: 'all' }))).toEqual([])
    })

    it('takes the subtree when the named option is a value it cannot read', async () => {
      const code = `${head}${rest}tt('list.0')\ntt('list.1')\ntt('menu', { all: flag })`
      expect(await unusedWith(code, { i18next: '*' }, calls({ option: 'all' }))).toEqual([])
    })

    it('takes only the key when the named option is not there', async () => {
      const code = `${head}${rest}tt('list.0')\ntt('list.1')\ntt('menu')`
      expect(await unusedWith(code, { i18next: '*' }, calls({ option: 'all' }))).toEqual(['menu.open'])
    })

    it('still takes the subtree of a call that says true', async () => {
      const code = `${head}${rest}tt('list')\ntt('menu.open')`
      expect(await unusedWith(code, { i18next: '*' }, calls(true))).toEqual([])
    })

    it('refuses a subtree that is neither true nor an option name', async () => {
      await expect(unusedWith(`${head}${rest}`, { i18next: '*' }, calls({ opt: 'all' }))).rejects.toThrow()
    })
  })

  // The items of an array have no names, so a key that names an array can only mean the whole array, however it is read.
  describe('a key that names an array', () => {
    it.each([
      ['without options', 't(\'list\')'],
      ['with the option false', 't(\'list\', { returnObjects: false })'],
      ['with a value the call does not write', 't(\'list\', { returnObjects: flag })'],
      ['with options in a variable', 't(\'list\', options)'],
      ['through getFixedT', 'const fixed = i18next.getFixedT(\'en\')\nfixed(\'list\')'],
    ])('counts the items as used, %s', async (_why, call) => {
      expect(await unusedWith(`${head}${rest}${call}\nt('menu.open')`)).toEqual([])
    })

    it('counts the items of an array of objects, and what is below them', async () => {
      const data = {
        steps: [
          { title: 'S1' },
          { title: 'S2', hint: 'H' },
        ],
        gone: 'Gone',
      }
      expect(await unusedWith(`${head}useTranslation()\nt('steps', { returnObjects: flag })`, undefined, {}, data)).toEqual(['gone'])
    })

    it('counts the items of an array in an object', async () => {
      const data = {
        home: {
          list: ['A', 'B'],
          t: 'T',
        },
        gone: 'Gone',
      }
      expect(await unusedWith(`${head}useTranslation()\nt('home.list', opts)\nt('home.t')`, undefined, {}, data)).toEqual(['gone'])
    })

    it('does not reach a sibling that shares the start of the name', async () => {
      const data = {
        list: ['A'],
        lists: ['B'],
      }
      expect(await unusedWith(`${head}useTranslation()\nt('list')`, undefined, {}, data)).toEqual(['lists.0'])
    })

    it('counts nothing for the parent object of an array: the array is not named', async () => {
      const data = {
        home: {
          list: ['A', 'B'],
        },
      }
      expect(await unusedWith(`${head}useTranslation()\nt('home')`, undefined, {}, data)).toEqual(['home.list.0', 'home.list.1'])
    })

    it('counts the items for vue-i18n t() too', async () => {
      const { project } = await createTestProject({
        'package.json': json({
          dependencies: { 'vue-i18n': '*', 'vue': '*' },
        }),
        'src/locales/en.json': json({
          list: ['A', 'B'],
          gone: 'Gone',
        }),
        'src/A.vue': '<script setup>\nconst { t } = useI18n()\nt(\'list\')\n</script>\n',
      })
      expect(project.analyze().unused).toEqual(['gone'])
    })

    it('is not planned for deletion', async () => {
      const { project } = await createTestProject({
        'package.json': json({
          dependencies: { i18next: '*' },
        }),
        'locales/en/translation.json': json({
          list: ['A', 'B'],
          gone: 'Gone',
        }),
        'src/App.ts': 'import i18next from \'i18next\'\ni18next.t(\'list\', { returnObjects: flag })\n',
      }, {
        resources: [
          { pattern: 'locales/{locale}/{namespaces}.json' },
        ],
      })
      expect(project.planUnused().keys.map(k => k.key)).toEqual(['translation:gone'])
    })
  })
})

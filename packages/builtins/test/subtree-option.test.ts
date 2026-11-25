import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const messages = {
  list: ['A', 'B'],
  menu: { open: 'Open' },
  menus: { all: 'All' },
  title: 'T',
  other: { x: 'X' },
}

async function unusedWith(code: string, deps: Record<string, string> = { 'i18next': '*', 'react-i18next': '*' }, config: Parameters<typeof createTestProject>[1] = {}): Promise<string[]> {
  const { project } = await createTestProject({
    'package.json': json({ dependencies: deps }),
    'locales/en/translation.json': json(messages),
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

    it('counts nothing below the key without the option', async () => {
      expect(await unusedWith(`${head}${rest}t('list')\nt('menu')`)).toEqual(['list.0', 'list.1', 'menu.open'])
    })

    it('counts nothing when the option is false', async () => {
      expect(await unusedWith(`${head}${rest}t('list', { returnObjects: false })\nt('menu.open')`)).toEqual(['list.0', 'list.1'])
    })

    it('counts nothing when the value is not written in the call, as it cannot be known', async () => {
      expect(await unusedWith(`${head}${rest}t('list', { returnObjects: flag })\nt('menu.open')`)).toEqual(['list.0', 'list.1'])
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

    it('takes only the key when the named option is not there', async () => {
      const code = `${head}${rest}tt('list')\ntt('menu.open')`
      expect(await unusedWith(code, { i18next: '*' }, calls({ option: 'all' }))).toEqual(['list.0', 'list.1'])
    })

    it('still takes the subtree of a call that says true', async () => {
      const code = `${head}${rest}tt('list')\ntt('menu.open')`
      expect(await unusedWith(code, { i18next: '*' }, calls(true))).toEqual([])
    })

    it('refuses a subtree that is neither true nor an option name', async () => {
      await expect(unusedWith(`${head}${rest}`, { i18next: '*' }, calls({ opt: 'all' }))).rejects.toThrow()
    })
  })
})

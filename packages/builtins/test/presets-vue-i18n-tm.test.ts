import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const files = {
  'package.json': json({
    dependencies: { 'vue-i18n': '*', 'vue': '*' },
  }),
  'src/locales/en/home.json': json({
    home: {
      benefits: {
        list: ['A', 'B'],
      },
      steps: [
        { title: 'S1' },
        { title: 'S2' },
      ],
      menu: { open: 'Open' },
      gone: 'Gone',
    },
  }),
}
const config = {
  sourceLocale: 'en',
  resources: [
    { pattern: 'src/locales/{locale}/{namespaces}.{ext}' },
  ],
}

function component(script: string): string {
  return `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`
}

describe('vue-i18n tm()', () => {
  it('reaches the items of an array, objects in it too', async () => {
    const { project } = await createTestProject({
      ...files,
      'src/A.vue': component('tm(\'home.home.benefits.list\')\ntm(\'home.home.steps\')'),
    }, config)
    const analysis = project.analyze()
    expect(analysis.unused).toEqual(['home.home.gone', 'home.home.menu.open'])
    expect(analysis.diagnostics.filter(d => d.code === 'missing-key')).toEqual([])
  })

  it('reaches the children of an object', async () => {
    const { project } = await createTestProject({
      ...files,
      'src/A.vue': component('tm(\'home.home.menu\')'),
    }, config)
    expect(project.analyze().unused).not.toContain('home.home.menu.open')
  })

  it('reaches the subtree from the template with $tm', async () => {
    const { project } = await createTestProject({
      ...files,
      'src/A.vue': '<template><li v-for="s in $tm(\'home.home.steps\')">{{ s }}</li></template>\n',
    }, config)
    expect(project.analyze().unused).toEqual([
      'home.home.benefits.list.0',
      'home.home.benefits.list.1',
      'home.home.gone',
      'home.home.menu.open',
    ])
  })

  it('leaves t() on an object as one key', async () => {
    const { project } = await createTestProject({
      ...files,
      'src/A.vue': component('t(\'home.home.menu\')'),
    }, config)
    expect(project.analyze().unused).toContain('home.home.menu.open')
  })

  it('does not reach a sibling that shares the start of the name', async () => {
    const { project } = await createTestProject({
      ...files,
      'src/locales/en/home.json': json({
        home: {
          menu: { open: 'Open' },
          menus: { all: 'All' },
        },
      }),
      'src/A.vue': component('tm(\'home.home.menu\')'),
    }, config)
    expect(project.analyze().unused).toEqual(['home.home.menus.all'])
  })
})

import type { Project } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const messages = {
  menu: { open: 'Open', close: 'Close' },
  list: ['A', 'B'],
  steps: [
    { title: 'S1' },
    { title: 'S2' },
  ],
  a: {
    'b.c': 'BC',
    'b': { d: 'BD' },
  },
  gone: 'Gone',
}

function files(source: Record<string, string>, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'package.json': json({
      dependencies: { 'vue-i18n': '*', 'vue': '*' },
    }),
    'src/locales/en.json': json(messages),
    ...source,
    ...extra,
  }
}

function component(script: string): string {
  return `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`
}

function missing(project: Project): string[] {
  return project.analyze().diagnostics.filter(d => d.code === 'missing-key').map(d => d.message)
}

describe('vue-i18n bracket paths in code', () => {
  it('counts a key written with brackets as used and not missing', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'menu["open"]\')\nt("menu[\'close\']")'),
    }))
    expect(missing(project)).toEqual([])
    expect(project.analyze().unused).not.toContain('menu.open')
    expect(project.analyze().unused).not.toContain('menu.close')
  })

  it('reads an index and a key after it', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'steps[1].title\')\nt(\'steps[0]["title"]\')'),
    }))
    expect(missing(project)).toEqual([])
    expect(project.analyze().unused).toEqual([
      'a.b.c',
      'a.b.d',
      'gone',
      'list.0',
      'list.1',
      'menu.close',
      'menu.open',
    ])
  })

  it('counts only the index it names', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'list[0]\')'),
    }))
    expect(missing(project)).toEqual([])
    const unused = project.analyze().unused
    expect(unused).toContain('list.1')
    expect(unused).not.toContain('list.0')
  })

  it('reads tm() and $tm in a template the same way', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': `${component('tm(\'list[0]\')')}<template><p>{{ $t('list[1]') }}</p></template>\n`,
    }))
    expect(missing(project)).toEqual([])
    expect(project.analyze().unused).not.toContain('list.0')
    expect(project.analyze().unused).not.toContain('list.1')
  })

  it('still reports an index that is not in the file, under its dotted key', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'list[9]\')'),
    }))
    expect(missing(project)).toEqual([
      expect.stringContaining('"list.9"'),
    ])
  })

  it('counts a key written both ways as used once', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'list[0]\')\nt(\'list.0\')'),
    }))
    expect(missing(project)).toEqual([])
    expect(project.usages({ key: 'list.0' })).toHaveLength(2)
  })

  it('reads the brackets as one key, so a dotted name matches the file', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'a["b.c"]\')'),
    }))
    expect(missing(project)).toEqual([])
    expect(project.analyze().unused).not.toContain('a.b.c')
  })

  it('leaves a path vue-i18n does not read as a missing key', async () => {
    const { project } = await createTestProject(files({
      'src/A.vue': component('t(\'list[i]\')\nt(\'menu[]\')'),
    }))
    expect(missing(project)).toHaveLength(2)
  })

  it('works under the namespace of a file', async () => {
    const { project } = await createTestProject({
      'package.json': json({
        dependencies: { 'vue-i18n': '*', 'vue': '*' },
      }),
      'src/locales/en/home.json': json({
        home: {
          list: ['A', 'B'],
        },
      }),
      'src/A.vue': component('t(\'home.home.list[0]\')'),
    }, {
      resources: [
        { pattern: 'src/locales/{locale}/{namespaces}.json' },
      ],
    })
    expect(missing(project)).toEqual([])
    expect(project.analyze().unused).toEqual(['home.home.list.1'])
  })

  it('does not apply to libraries that do not read brackets', async () => {
    const { project } = await createTestProject({
      'package.json': json({
        dependencies: { 'react-i18next': '*' },
      }),
      'locales/en/common.json': json({
        list: { 0: 'A' },
      }),
      'src/App.tsx': `const { t } = useTranslation('common')\nt('list[0]')\n`,
    }, {
      resources: [
        { pattern: 'locales/{locale}/{namespaces}.json' },
      ],
    })
    expect(missing(project)).toEqual([
      expect.stringContaining('list[0]'),
    ])
  })
})

describe('renaming a key used with brackets', () => {
  async function rename(source: string, op: Parameters<Project['plan']>[0]): Promise<Map<string, string>> {
    const { project, files: written } = await createTestProject(files({ 'src/A.vue': source }))
    const plan = project.plan(op)
    await project.apply(plan, {
      answers: Object.fromEntries(plan.decisions.map(d => [d.id, d.default])),
    })
    return written
  }

  it('writes the new key in the dotted form, in either quote', async () => {
    const written = await rename(
      component('t(\'menu["open"]\')\nt("menu[\'open\']")\nt(\'menu.open\')'),
      [
        { type: 'rename', from: 'menu.open', to: 'menu.show' },
      ],
    )
    expect(written.get('src/A.vue')).toBe(component('t(\'menu.show\')\nt("menu.show")\nt(\'menu.show\')'))
    expect(JSON.parse(written.get('src/locales/en.json')!).menu).toEqual({ show: 'Open', close: 'Close' })
  })

  it('rewrites an index and the key after it', async () => {
    const written = await rename(
      component('t(\'steps[1].title\')'),
      [
        { type: 'rename', from: 'steps.1.title', to: 'steps.1.name' },
      ],
    )
    expect(written.get('src/A.vue')).toBe(component('t(\'steps.1.name\')'))
  })

  it('rewrites the static part of a prefix rename and leaves the rest of the file alone', async () => {
    const written = await rename(
      component('t(\'menu["open"]\')\nconst keep = \'menu["open"]\''),
      [
        { type: 'rename-prefix', from: 'menu', to: 'nav' },
      ],
    )
    expect(written.get('src/A.vue')).toBe(component('t(\'nav.open\')\nconst keep = \'menu["open"]\''))
  })
})

import type { ProjectInfo, TreeNode, TreeParams } from '@x18n/lsp'
import type { Requests, X18nClient } from '../src/model/client'
import { describe, expect, it } from 'vitest'
import { projectFor } from '../src/model/client'
import { fileItems, keyTree, progressItems, usageReportItems } from '../src/model/tree'

const range = (line: number) => ({ start: { line, character: 3 }, end: { line, character: 9 } })

function project(name: string, root: string): ProjectInfo {
  return { name, root, sourceLocale: 'en', locales: [{ code: 'en', displayName: 'English', flag: undefined }], displayLocale: 'en', keys: 2 }
}

const trees: Record<string, TreeNode[]> = {
  '': [{ key: 'app', label: 'app', leaf: false, translated: 1, total: 2, value: undefined }],
  'app': [
    { key: 'app.title', label: 'title', leaf: true, translated: 1, total: 1, value: 'My App' },
    { key: 'app.greeting', label: 'greeting', leaf: true, translated: 0, total: 1, value: undefined },
  ],
}

/** Answers `x18n/projects` and `x18n/tree` like the server does for the vue-i18n fixture. */
function fakeClient(projects: ProjectInfo[]): X18nClient & { trees: TreeParams[] } {
  const asked: TreeParams[] = []
  const handlers: { [M in keyof Requests]?: (params: Requests[M][0]) => Requests[M][1] } = {
    'x18n/projects': () => projects,
    'x18n/tree': (params) => {
      asked.push(params)
      return trees[params.parent ?? ''] ?? []
    },
  }
  return {
    trees: asked,
    request: async (method, params) => {
      const handler = handlers[method]
      if (!handler)
        throw new Error(`unexpected ${method}`)
      return handler(params)
    },
  }
}

describe('keyTree', () => {
  it('loads children lazily by parent', async () => {
    const client = fakeClient([project('app', '/w')])
    const [app] = await keyTree(client)
    expect(app).toMatchObject({ label: 'app', description: '1/2', context: 'x18n.prefix', ref: { key: 'app' } })
    expect(client.trees).toEqual([{ project: undefined, parent: undefined }])
    const children = await app!.children!()
    expect(client.trees.at(-1)).toEqual({ project: undefined, parent: 'app' })
    expect(children.map(c => [c.label, c.description, c.context, c.children])).toEqual([
      ['title', 'My App', 'x18n.key', undefined],
      ['greeting', '(missing)', 'x18n.key', undefined],
    ])
    expect(children[0]!.openKey).toEqual({ project: undefined, key: 'app.title' })
  })

  it('groups by project when there are several', async () => {
    const client = fakeClient([project('web', '/w/web'), project('docs', '/w/docs')])
    const roots = await keyTree(client)
    expect(roots.map(r => r.label)).toEqual(['web', 'docs'])
    await roots[1]!.children!()
    expect(client.trees).toEqual([{ project: 'docs', parent: undefined }])
  })
})

describe('projectFor', () => {
  it('picks the deepest project root holding the path', () => {
    const projects = [project('root', '/w'), project('web', '/w/web')]
    expect(projectFor(projects, '/w/web/src/a.ts')?.name).toBe('web')
    expect(projectFor(projects, '/w/webapp/a.ts')?.name).toBe('root')
    expect(projectFor(projects, '/elsewhere/a.ts')).toBeUndefined()
  })
})

describe('fileItems', () => {
  it('lists keys with state and line, then hard strings, each opening its location', () => {
    const items = fileItems('file:///w/App.vue', 'app', {
      keys: [
        { key: 'app.title', range: range(4), value: 'My App', missing: false, dynamic: false },
        { key: 'app.titel', range: range(15), value: undefined, missing: true, dynamic: false },
        { key: 'pages.', range: range(14), value: undefined, missing: false, dynamic: true },
      ],
      hardStrings: [{ text: 'Hello', range: range(20) }],
    })
    expect(items.map(i => [i.label, i.description, i.icon, i.ref])).toEqual([
      ['app.title', 'My App · L5', 'symbol-string', { project: 'app', key: 'app.title' }],
      ['app.titel', '(missing) · L16', 'warning', { project: 'app', key: 'app.titel' }],
      ['pages.', '(dynamic) · L15', 'symbol-variable', undefined],
      ['Hello', 'hard string · L21', 'quote', undefined],
    ])
    expect(items[3]!.location).toEqual({ uri: 'file:///w/App.vue', range: range(20) })
  })
})

describe('progressItems', () => {
  it('shows coverage per locale and expands to missing and empty keys', async () => {
    const app = { ...project('app', '/w'), locales: [{ code: 'de', displayName: 'Deutsch', flag: '🇩🇪' }] }
    const [de] = progressItems({ projects: [{ name: 'app', locales: [{ locale: 'de', translated: 3, total: 4, missing: ['a'], empty: ['b'] }] }] }, [app])
    expect(de).toMatchObject({ label: 'de', description: '75% · 3/4', locale: { code: 'de', flag: '🇩🇪' } })
    const groups = await de!.children!()
    expect(groups.map(g => [g.label, g.description])).toEqual([['Missing', '1'], ['Empty', '1']])
    expect(await groups[0]!.children!()).toMatchObject([{ label: 'a', openKey: { project: 'app', key: 'a' } }])
  })

  it('has no children for complete locales', () => {
    const [en] = progressItems({ projects: [{ name: 'app', locales: [{ locale: 'en', translated: 4, total: 4, missing: [], empty: [] }] }] }, [])
    expect(en).toMatchObject({ icon: 'pass', description: '100% · 4/4' })
    expect(en!.children).toBeUndefined()
  })
})

describe('usageReportItems', () => {
  it('groups unused and missing keys', async () => {
    const location = { uri: 'file:///w/App.vue', range: range(15) }
    const [unused, missing] = usageReportItems({
      unused: [{ project: 'app', key: 'unused', location }],
      missing: [{ project: 'app', key: 'app.titel', locations: [location, location] }],
    })
    expect([unused!.description, missing!.description]).toEqual(['1', '1'])
    const [titel] = await missing!.children!()
    expect(titel).toMatchObject({ label: 'app.titel', description: '2 usages', location })
    expect(await titel!.children!()).toHaveLength(2)
  })
})

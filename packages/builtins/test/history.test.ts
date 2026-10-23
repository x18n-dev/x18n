import type { HistoryProvider, KeyString, LocaleCode, MessageChange, Project, UserConfig } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const files = {
  'locales/en.json': json({ title: 'Home', save: 'Save', next: 'Next' }),
  'locales/de.json': json({ title: 'Startseite', save: 'Speichern', next: 'Weiter' }),
}

const day = 86_400_000

/** A provider with fixed entries: `[key, locale, day, value]`. */
function fixed(id: string, entries: readonly (readonly [KeyString, LocaleCode, number, string])[]): HistoryProvider {
  return {
    id,
    async load() {
      const changes = new Map<KeyString, Map<LocaleCode, MessageChange>>()
      for (const [key, locale, at, value] of entries)
        changes.set(key, (changes.get(key) ?? new Map()).set(locale, { updatedAt: at * day, revision: `${id}-${at}`, value }))
      return {
        changes,
        valueAt: (key, locale) => key === 'title' && locale === 'en'
          ? 'Start'
          : undefined,
      }
    },
  }
}

const git = fixed('fake', [
  ['title', 'en', 5, 'Home'],
  ['title', 'de', 2, 'Startseite'],
  ['save', 'en', 3, 'Save'],
  ['save', 'de', 3, 'Speichern'],
  ['next', 'en', 4, 'Next'],
])

async function load(config: UserConfig = {}): Promise<Project> {
  const { project } = await createTestProject(files, {
    resources: [
      { pattern: 'locales/{locale}.json' },
    ],
    ...config,
  })
  await project.loadHistory()
  return project
}

function stale(project: Project): string[] {
  return project.analyze().diagnostics.filter(d => d.code === 'stale-translation').map(d => `${d.key}:${d.locale}`)
}

describe('stale translations', () => {
  it('reports targets older than their source; ties and missing history are fresh', async () => {
    const project = await load({
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
    })
    expect(stale(project)).toEqual(['title:de'])
    const diagnostic = project.analyze().diagnostics.find(d => d.code === 'stale-translation')!
    expect(diagnostic.message).toBe('"title" in de is older than en (source changed 1970-01-06 in fake-5).')
    expect(diagnostic.location?.path).toBe('locales/de.json')
    expect(project.analyze().coverage.map(c => [c.locale, c.outdated])).toEqual([
      ['en', []],
      [
        'de',
        ['title'],
      ],
    ])
    expect(project.history('save', 'de')).toMatchObject({ updatedAt: 3 * day, revision: 'fake-3' })
  })

  it('reports nothing before history is loaded or with `history: false`', async () => {
    const { project } = await createTestProject(files, {
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
    })
    expect(stale(project)).toEqual([])
    expect(stale(await load({
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
      history: false,
    }))).toEqual([])
  })

  it('treats a value that differs from the provider as a local change', async () => {
    const project = await load({
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
    })
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'save',
        locale: 'en',
        value: 'Store',
      },
      {
        type: 'set',
        key: 'title',
        locale: 'de',
        value: 'Start',
      },
    ]))
    expect(project.history('save', 'en')?.updatedAt).toBe(Number.POSITIVE_INFINITY)
    expect(stale(project)).toEqual(['save:de'])
  })

  it('asks inline providers before plugin providers', async () => {
    const inline = fixed('inline', [
      ['title', 'de', 9, 'Startseite'],
    ])
    const project = await load({
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
      history: {
        providers: [inline],
      },
    })
    expect(project.history('title', 'de')?.revision).toBe('inline-9')
    expect(stale(project)).toEqual([])
  })

  it('adds stale translations to translate prompts with the old source text', async () => {
    const project = await load({
      plugins: [
        {
          name: 'fake-history',
          histories: [git],
        },
      ],
    })
    expect(project.prompt('translate', 'de').items).toEqual([])
    const items = project.prompt('translate', 'de', { stale: true, context: false }).items
    expect(items).toMatchObject([
      {
        key: 'title',
        source: 'Home',
        existing: 'Startseite',
        previousSource: 'Start',
      },
    ])
  })
})

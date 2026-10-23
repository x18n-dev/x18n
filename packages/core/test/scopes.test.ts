import type { MessageTree, Plugin, UsageCandidate, UserConfig } from '../src'
import { describe, expect, it } from 'vitest'
import { createMemoryHost, createProject, resolveConfig } from '../src'

// `en.json` has no namespace, `{namespace}.json` is English in that namespace. Every `.page` file is one scope
// with the optional key prefix `page`; `t('a')` is a key, `t(`a.${x}`)` a key prefix.
const plugin: Plugin = {
  name: 'test',
  localeFinders: [
    {
      id: 'json',
      find: async ({ host }) => (await host.glob(['*.json'])).map((path) => {
        const name = path.slice(0, -'.json'.length)
        return {
          path,
          locale: 'en',
          namespace: name === 'en'
            ? undefined
            : name,
        }
      }),
    },
  ],
  formats: [
    {
      id: 'json',
      extensions: ['json'],
      parse: (text) => {
        const tree: MessageTree = JSON.parse(text)
        return { tree }
      },
    },
  ],
  scanners: [
    {
      id: 'page',
      extensions: ['page'],
      scan: file => ({
        usages: [
          ...file.text.matchAll(/t\((?:'([^']*)'|`([^`$]*)\$\{)/g),
        ].map((match): UsageCandidate => ({
          raw: match[1] ?? match[2]!,
          range: { start: match.index, end: match.index + match[0].length },
          kind: 'call',
          dynamic: match[1] === undefined
            ? 'prefix'
            : false,
        })),
        scopes: [
          {
            range: { start: 0, end: file.text.length },
            keyPrefix: 'page',
            optionalPrefix: true,
          },
        ],
      }),
    },
  ],
}

async function usageKeys(files: Record<string, string>, config: UserConfig): Promise<(string | undefined)[]> {
  const host = createMemoryHost(files)
  const project = createProject({ host, setup: await resolveConfig({
    host,
    config,
    builtins: {
      plugins: [plugin],
      presets: {},
    },
  }) })
  await project.ready
  return project.usages().map(match => match.usage.key)
}

describe('optional key prefix', () => {
  it('applies the prefix only to keys it defines', async () => {
    const keys = await usageKeys({
      'en.json': JSON.stringify({
        title: 'Site',
        back: 'Back',
        list: { a: 'A' },
        page: {
          title: 'Page',
          items: { a: 'A' },
        },
      }),
      'a.page': `t('title') t('back') t(\`items.\${id}\`) t(\`list.\${id}\`)`,
    }, {})
    expect(keys).toEqual([
      'page.title',
      'back',
      'page.items.',
      'list.',
    ])
  })

  it('tries the prefix in the usage namespace before the fallback namespaces', async () => {
    const keys = await usageKeys({
      'app.json': JSON.stringify({
        page: { title: 'Page' },
      }),
      'common.json': JSON.stringify({
        title: 'Site',
        back: 'Back',
        page: { save: 'Save' },
      }),
      'a.page': 't(\'title\') t(\'back\') t(\'save\')',
    }, {
      namespace: {
        separator: ':',
        default: 'app',
        fallback: ['common'],
      },
    })
    expect(keys).toEqual(['app:page.title', 'common:back', 'app:save'])
  })
})

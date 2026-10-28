import type { Host, MessageTree, Plugin } from '../src'
import { describe, expect, it } from 'vitest'
import { createMemoryHost, createProject, resolveConfig } from '../src'

const plugin: Plugin = {
  name: 'test',
  localeFinders: [
    {
      id: 'json',
      find: async ({ host }) => (await host.glob(['locales/*.json'])).map(path => ({
        path,
        locale: path.slice('locales/'.length, -'.json'.length),
        namespace: undefined,
      })),
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
          ...file.text.matchAll(/t\('([^']*)'\)/g),
        ].map(match => ({
          raw: match[1]!,
          range: { start: match.index, end: match.index + match[0].length },
          kind: 'call' as const,
          dynamic: false as const,
        })),
      }),
    },
  ],
}

// Counts reads in flight, the way open file handles add up on a real file system.
function countingHost(base: Host): { host: Host, peak: () => number } {
  let open = 0
  let peak = 0
  return {
    host: {
      ...base,
      readFile: async (path) => {
        open++
        peak = Math.max(peak, open)
        await new Promise(resolve => setTimeout(resolve, 0))
        try {
          return await base.readFile(path)
        }
        finally {
          open--
        }
      },
    },
    peak: () => peak,
  }
}

describe('file reads', () => {
  it('keeps reads in flight bounded on large projects', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 500; i++) {
      files[`src/f${i}.page`] = `t('k${i % 5}')`
      files[`locales/l${i}.json`] = JSON.stringify({ [`k${i % 5}`]: 'x' })
    }
    const { host, peak } = countingHost(createMemoryHost(files))
    const project = createProject({ host, setup: await resolveConfig({
      host,
      config: { sourceLocale: 'l0' },
      builtins: {
        plugins: [plugin],
        presets: {},
      },
    }) })
    await project.ready
    expect(project.usages()).toHaveLength(500)
    expect(peak()).toBeGreaterThan(1)
    expect(peak()).toBeLessThanOrEqual(64)
  })
})

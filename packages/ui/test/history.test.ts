import type { DevframeNodeContext } from 'devframe'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadWorkspace } from '@x18n/node'
import { createX18nDevframe } from '@x18n/ui'
import { createHostContext } from 'devframe/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Git hooks set GIT_DIR and friends; they would point every git call here at the repo running the hook.
for (const name of Object.keys(process.env).filter(name => name.startsWith('GIT_')))
  delete process.env[name]

const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url))
let root: string
let ctx: DevframeNodeContext
let project: string
let dispose: () => void

function git(args: readonly string[], date = '2026-01-01T00:00:00Z'): Promise<void> {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Ada',
    GIT_AUTHOR_EMAIL: 'ada@example.com',
    GIT_COMMITTER_NAME: 'Ada',
    GIT_COMMITTER_EMAIL: 'ada@example.com',
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  }
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: root, env }, error => error
      ? reject(error)
      : resolve())
  })
}

beforeAll(async () => {
  root = join(await mkdtemp(join(tmpdir(), 'x18n-ui-history-')), 'vue-i18n')
  await cp(join(fixtures, 'vue-i18n'), root, { recursive: true })
  await git(['init', '-q'])
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'first'])
  const en = JSON.parse(await readFile(join(root, 'src/locales/en.json'), 'utf8'))
  await writeFile(join(root, 'src/locales/en.json'), JSON.stringify({
    ...en,
    app: { ...en.app, title: 'My Great App' },
  }, null, 2))
  await git(['commit', '-q', '-am', 'second'], '2026-02-01T00:00:00Z')
  const workspace = await loadWorkspace({ cwd: root, cache: false })
  project = workspace.projects[0]!.name
  dispose = () => workspace.projects.forEach(p => p.project.dispose())
  ctx = await createHostContext({
    cwd: root,
    mode: 'dev',
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'http://localhost',
      getStorageDir: () => join(root, '.devframe'),
    },
  })
  await createX18nDevframe(workspace.projects).setup(ctx)
  await workspace.projects[0]!.project.loadHistory()
})

afterAll(async () => {
  dispose()
  await rm(join(root, '..'), { recursive: true, force: true })
})

describe('history in the UI', () => {
  it('counts outdated translations and lists the latest changes', async () => {
    const { projects: [summary] } = await ctx.rpc.invokeLocal('x18n:project')
    expect(summary!.locales.find(l => l.code === 'de')?.outdated).toBe(1)
    expect(summary!.changes[0]).toMatchObject({
      keys: [
        {
          key: 'app.title',
          locales: ['en'],
        },
      ],
      total: 1,
      at: Date.parse('2026-02-01T00:00:00Z'),
      author: 'Ada',
    })
  })

  it('flags outdated cells and shows the source text from back then', async () => {
    const table = await ctx.rpc.invokeLocal('x18n:keys', { project })
    expect(table.rows.find(r => r.key === 'app.title')).toMatchObject({
      outdated: ['de'],
      changedAt: Date.parse('2026-02-01T00:00:00Z'),
    })
    const detail = await ctx.rpc.invokeLocal('x18n:key', { project, key: 'app.title' })
    expect(detail?.messages.find(m => m.locale === 'de')).toMatchObject({
      outdated: true,
      sourceThen: 'My App',
      changed: {
        at: Date.parse('2026-01-01T00:00:00Z'),
      },
    })
    expect(detail?.messages.find(m => m.locale === 'en')).toMatchObject({ outdated: false, sourceThen: undefined })
  })

  it('adds outdated translations to the prompt on request', async () => {
    expect(await ctx.rpc.invokeLocal('x18n:translate-prompt', { project, locale: 'de' })).not.toContain('### `app.title`')
    expect(await ctx.rpc.invokeLocal('x18n:translate-prompt', { project, locale: 'de', stale: true })).toContain('Source when de last changed: "My App"')
  })
})

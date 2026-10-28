import type { Project } from '@x18n/core'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadWorkspace } from '../src'

// Git hooks set GIT_DIR and friends; they would point every git call here at the repo running the hook.
for (const name of Object.keys(process.env).filter(name => name.startsWith('GIT_')))
  delete process.env[name]

let root: string
let day = 0
const day0 = Date.UTC(2026, 0, 1) / 1000

function git(cwd: string, args: readonly string[]): Promise<string> {
  const date = `${day0 + day * 86_400} +0000`
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
    execFile('git', [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'init.defaultBranch=main',
      ...args,
    ], { cwd, env }, (error, stdout) => error
      ? reject(error)
      : resolve(stdout))
  })
}

async function write(files: Record<string, object>): Promise<void> {
  for (const [path, value] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), `${JSON.stringify(value, null, 2)}\n`)
  }
}

/** Writes files and commits them on the next day. */
async function commit(files: Record<string, object>, message = `day ${day}`): Promise<void> {
  day++
  await write(files)
  await git(root, ['add', '-A'])
  await git(root, ['commit', '-q', '-m', message])
}

const config = {
  resources: [
    { pattern: 'locales/{locale}.json' },
  ],
}

async function open(cwd = root, extra: object = {}): Promise<Project> {
  await writeFile(join(root, 'x18n.config.json'), JSON.stringify({
    ...config,
    ...extra,
  }))
  const { projects } = await loadWorkspace({ cwd, cache: false })
  await projects[0]!.project.loadHistory()
  return projects[0]!.project
}

const stale = (project: Project): string[] => project.analyze().coverage.flatMap(c => c.outdated.map(key => `${key}:${c.locale}`))
const at = (n: number): number => (day0 + n * 86_400) * 1000

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'x18n-git-'))
  day = 0
  await git(root, ['init', '-q'])
  await writeFile(join(root, 'x18n.config.json'), JSON.stringify(config))
})

afterEach(async () => {
  // Windows can keep a directory locked for a moment after the process using it exits.
  await rm(root, { recursive: true, force: true, maxRetries: 5 })
})

// Each test runs several git commands, and Windows runners are slow at spawning them.
describe('git history provider', { timeout: 30_000 }, () => {
  it('reports translations whose source changed in a later commit', async () => {
    await commit({
      'locales/en.json': { title: 'Home', save: 'Save' },
      'locales/de.json': { title: 'Start', save: 'Speichern' },
    })
    await commit({
      'locales/en.json': { title: 'Homepage', save: 'Save' },
    })
    const project = await open()
    expect(stale(project)).toEqual(['title:de'])
    expect(project.history('title', 'en')).toMatchObject({
      updatedAt: at(2),
      author: 'Ada',
      value: 'Homepage',
    })
    expect(project.history('save', 'en')?.updatedAt).toBe(at(1))
    expect(project.prompt('translate', 'de', { stale: true, context: false }).items).toMatchObject([
      { key: 'title', previousSource: 'Home' },
    ])
  })

  it('ignores reformatting, reordering and moves between files', async () => {
    await commit({
      'locales/en.json': { a: 'A', b: 'B' },
      'locales/de.json': { a: 'A-de', b: 'B-de' },
    })
    await commit({
      'locales/de.json': { b: 'B-de', a: 'A-de', c: 'C-de' },
      'locales/en.json': { b: 'B', a: 'A', c: 'C' },
    })
    await writeFile(join(root, 'x18n.config.json'), JSON.stringify({
      resources: [
        { pattern: 'locales/{locale}.json' },
        { pattern: 'more/{locale}.json' },
      ],
    }))
    await commit({
      'locales/en.json': { b: 'B', c: 'C' },
      'more/en.json': { a: 'A' },
    })
    const { projects } = await loadWorkspace({ cwd: root, cache: false })
    const project = projects[0]!.project
    await project.loadHistory()
    expect(project.history('a', 'en')?.updatedAt).toBe(at(1))
    expect(project.history('c', 'en')?.updatedAt).toBe(at(2))
    expect(stale(project)).toEqual([])
  })

  it('follows renamed resource files', async () => {
    await commit({
      'i18n/en.json': { title: 'Home' },
      'i18n/de.json': { title: 'Start' },
    })
    await commit({
      'i18n/en.json': { title: 'Homepage' },
    })
    day++
    await mkdir(join(root, 'locales'))
    await rename(join(root, 'i18n/en.json'), join(root, 'locales/en.json'))
    await rename(join(root, 'i18n/de.json'), join(root, 'locales/de.json'))
    await git(root, ['add', '-A'])
    await git(root, ['commit', '-q', '-m', 'move'])
    const project = await open()
    expect(project.history('title', 'en')?.updatedAt).toBe(at(2))
    expect(stale(project)).toEqual(['title:de'])
  })

  it('treats uncommitted edits as changed now', async () => {
    await commit({
      'locales/en.json': { title: 'Home' },
      'locales/de.json': { title: 'Start' },
    })
    await write({
      'locales/en.json': { title: 'Homepage' },
    })
    const project = await open()
    expect(project.history('title', 'en')?.updatedAt).toBe(Number.POSITIVE_INFINITY)
    expect(stale(project)).toEqual(['title:de'])
  })

  it('counts only changes inside `maxDepth` and `since`', async () => {
    await commit({
      'locales/en.json': { title: 'Home', save: 'Save' },
      'locales/de.json': { title: 'Start', save: 'Speichern' },
    })
    await commit({
      'locales/en.json': { title: 'Homepage', save: 'Save' },
    })
    const depth = await open(root, {
      history: {
        git: { maxDepth: 1 },
      },
    })
    expect(depth.history('save', 'en')).toBeUndefined()
    expect(depth.history('title', 'en')?.updatedAt).toBe(at(2))
    expect(stale(depth)).toEqual([])
    const since = await open(root, {
      history: {
        git: {
          since: new Date(at(2) - 1000).toISOString(),
        },
      },
    })
    expect(since.history('title', 'de')).toBeUndefined()
    expect((await open(root, {
      history: { git: false },
    })).history('title', 'en')).toBeUndefined()
  })

  it('reports nothing for a shallow clone', async () => {
    await commit({
      'locales/en.json': { title: 'Home' },
      'locales/de.json': { title: 'Start' },
    })
    await commit({
      'locales/en.json': { title: 'Homepage' },
    })
    const clone = join(root, 'clone')
    await git(root, [
      'clone',
      '-q',
      '--depth',
      '1',
      `file://${root}`,
      clone,
    ])
    const warnings: string[] = []
    const { projects } = await loadWorkspace({
      cwd: clone,
      cache: false,
      logger: {
        info: () => {},
        warn: message => warnings.push(message),
        error: () => {},
      },
    })
    await projects[0]!.project.loadHistory()
    expect(projects[0]!.project.history('title', 'en')).toBeUndefined()
    expect(warnings.join('\n')).toContain('fetch-depth: 0')
  })

  it('walks only new commits when the cached HEAD is an ancestor', async () => {
    await commit({
      'locales/en.json': { title: 'Home' },
      'locales/de.json': { title: 'Start' },
    })
    const first = await loadWorkspace({ cwd: root })
    await first.projects[0]!.project.loadHistory()
    await first.projects[0]!.host.flush()
    await commit({
      'locales/en.json': { title: 'Homepage' },
    })
    const { projects } = await loadWorkspace({ cwd: root })
    await projects[0]!.project.loadHistory()
    expect(projects[0]!.project.history('title', 'de')?.updatedAt).toBe(at(1))
    expect(projects[0]!.project.history('title', 'en')?.updatedAt).toBe(at(2))
  })
})

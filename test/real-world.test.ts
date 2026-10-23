import { execFile, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

// x18n on real projects, pinned to a commit so results only change when x18n changes.
// Opt-in, as it clones from GitHub: `pnpm test:real-world`.
const repos = [
  { name: 'furifont', url: 'https://github.com/antfu/furifont', commit: 'c539fc3cbf6fafdad59c09648b9d2e64230c0094' },
  { name: 'pulls.review', url: 'https://github.com/antfu/pulls.review', commit: '974853a71f1e21b8018e23554687523282cef40b' },
  { name: 'elk', url: 'https://github.com/elk-zone/elk', commit: '2f94671ed0a02224033598aef3e237ee2aafae12' },
] as const

const repo = fileURLToPath(new URL('..', import.meta.url))
const cli = join(repo, 'packages/cli/bin.mjs')
const lsp = join(repo, 'packages/lsp/bin.mjs')
const cache = join(repo, 'node_modules/.cache/x18n-real-world')

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

/** A checkout of the pinned commit, reused across runs. */
async function checkout(name: string, url: string, commit: string): Promise<string> {
  const dir = join(cache, `${name}@${commit.slice(0, 12)}`)
  if (existsSync(join(dir, '.git')))
    return dir
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  git(dir, ['init', '-q'])
  git(dir, [
    'fetch',
    '-q',
    '--depth',
    '1',
    url,
    commit,
  ])
  git(dir, ['checkout', '-q', 'FETCH_HEAD'])
  return dir
}

function x18n<T>(cwd: string, args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args, '--json', '--no-cache'], { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (!stdout)
        reject(error ?? new Error('no output'))
      else
        resolve(JSON.parse(stdout).data)
    })
  })
}

interface Diagnostic { code: string, severity: string, key?: string, file?: string }
interface Status { sourceLocale: string, keys: number, usages: number, locales: { locale: string }[] }
interface Usage { key?: string, file: string, line: number, column: number, possible: boolean }

/** What a reviewer checks: what x18n understood, and every error and unused key it reports. */
async function summary(dir: string): Promise<object> {
  const [status] = (await x18n<{ projects: Status[] }>(dir, ['status'])).projects
  const [explained] = (await x18n<{ projects: { configFile?: string, presets: { name: string, reason: string }[] }[] }>(dir, ['doctor'])).projects
  const diagnostics: Diagnostic[] = await new Promise((resolve) => {
    execFile(process.execPath, [cli, 'check', '--json', '--no-cache'], { cwd: dir, maxBuffer: 64 * 1024 * 1024 }, (_, stdout) => resolve(JSON.parse(stdout).diagnostics))
  })
  const counts: Record<string, number> = {}
  for (const d of diagnostics)
    counts[d.code] = (counts[d.code] ?? 0) + 1
  return {
    config: explained!.configFile,
    presets: explained!.presets.filter(p => p.reason === 'detected' || p.reason === 'listed').map(p => p.name),
    sourceLocale: status!.sourceLocale,
    locales: status!.locales.length,
    keys: status!.keys,
    usages: status!.usages,
    diagnostics: Object.fromEntries(Object.entries(counts).sort()),
    errors: diagnostics.filter(d => d.severity === 'error').map(d => `${d.code} ${d.key} ${d.file}`).sort(),
    unused: diagnostics.filter(d => d.code === 'unused-key').map(d => d.key).sort(),
  }
}

/** Go to definition from a usage, through the language server binary. */
async function definition(dir: string, usage: Usage): Promise<string[]> {
  const child = spawn(process.execPath, [lsp, '--stdio'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))
  connection.listen()
  try {
    await connection.sendRequest('initialize', { processId: null, rootUri: pathToFileURL(dir).href, capabilities: {} })
    await connection.sendNotification('initialized', {})
    await connection.sendRequest('x18n/projects')
    const locations: { uri: string }[] = await connection.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToFileURL(join(dir, usage.file)).href },
      position: { line: usage.line - 1, character: usage.column },
    })
    return locations.map(l => relative(dir, fileURLToPath(l.uri)).replace(/\\/g, '/'))
  }
  finally {
    connection.dispose()
    child.kill()
  }
}

describe.each(repos)('$name', ({ name, url, commit }) => {
  let dir: string

  beforeAll(async () => {
    dir = await checkout(name, url, commit)
  }, 300_000)

  it('understands the project', async () => {
    expect(await summary(dir)).toMatchSnapshot()
  }, 120_000)

  it('goes to the definition of a usage', async () => {
    const { projects } = await x18n<{ projects: { usages: Usage[] }[] }>(dir, ['usages'])
    const usage = projects[0]!.usages.find(u => !u.possible && u.key)!
    const { projects: [key] } = await x18n<{ projects: { messages: { locale: string, file: string }[] }[] }>(dir, ['get', usage.key!])
    const source = key!.messages[0]!.file
    expect(await definition(dir, usage)).toEqual([source])
  }, 120_000)
})

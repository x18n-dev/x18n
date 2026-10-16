import type { ChildProcess } from 'node:child_process'
import type { MessageConnection } from 'vscode-jsonrpc/node'
import { execFile, spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

// End-to-end runs of the built CLI and language server on the projects in `playground/`.
const repo = fileURLToPath(new URL('..', import.meta.url))
const cli = join(repo, 'packages/cli/bin.mjs')
const lsp = join(repo, 'packages/lsp/bin.mjs')
const dirs: string[] = []

afterAll(async () => {
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
})

async function copy(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `x18n-playground-${name}-`))
  dirs.push(dir)
  await cp(join(repo, 'playground', name), dir, { recursive: true })
  return dir
}

function x18n(cwd: string, args: string[]): Promise<{ stdout: string, code: number }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args, '--no-cache'], { cwd, env: { ...process.env, NO_COLOR: '1' } }, (error, stdout) => {
      resolve({ stdout, code: error ? Number(error.code ?? 1) : 0 })
    })
  })
}

interface WireDiagnostic { code: string, key?: string, file?: string, range?: { line: number } }

async function diagnostics(cwd: string): Promise<string[]> {
  const { stdout } = await x18n(cwd, ['check', '--json'])
  const data: { diagnostics: WireDiagnostic[] } = JSON.parse(stdout)
  return data.diagnostics.map(d => `${d.code} ${d.key ?? ''} ${d.file}:${d.range?.line}`).sort()
}

const read = (dir: string, path: string): Promise<string> => readFile(join(dir, path), 'utf8')

describe('x18n check finds the planted problems', () => {
  it.each(['vue-vite', 'react-i18next', 'next-intl', 'laravel', 'rails', 'angular', 'monorepo'])('%s', async (name) => {
    expect(await diagnostics(await copy(name))).toMatchSnapshot()
  }, 30_000)

  it('a config written by `x18n init` gives the same result as detection', async () => {
    for (const name of ['vue-vite', 'react-i18next', 'laravel', 'rails']) {
      const dir = await copy(name)
      const detected = await diagnostics(dir)
      expect((await x18n(dir, ['init'])).code).toBe(0)
      expect(await diagnostics(dir), name).toEqual(detected)
    }
  }, 60_000)
})

describe('write commands keep files tidy', () => {
  it('vue-vite: a parent rename stays in place and updates the dynamic usage', async () => {
    const dir = await copy('vue-vite')
    const before = await read(dir, 'src/locales/en.json')
    expect((await x18n(dir, ['rename', 'pages', 'screens'])).code).toBe(0)
    expect(await read(dir, 'src/locales/en.json')).toBe(before.replace('"pages"', '"screens"'))
    expect(await read(dir, 'src/App.vue')).toContain('$t(`screens.${page}.title`)') // eslint-disable-line no-template-curly-in-string
  }, 30_000)

  it('react-i18next: renames plurals and moves keys to a new namespace file', async () => {
    const dir = await copy('react-i18next')
    expect((await x18n(dir, ['rename', 'common:item', 'common:product'])).code).toBe(0)
    expect(JSON.parse(await read(dir, 'public/locales/fr/common.json'))).toMatchObject({ product_one: '{{count}} élément', product_other: '{{count}} éléments' })
    expect(await read(dir, 'src/Cart.tsx')).toContain('t(\'product\', { count })')
    expect((await x18n(dir, ['rename', 'common:cancel', 'actions:cancel'])).code).toBe(0)
    expect(JSON.parse(await read(dir, 'public/locales/fr/actions.json'))).toEqual({ cancel: 'Annuler' })
    expect(await read(dir, 'src/Login.tsx')).toContain('t(\'actions:cancel\')')
  }, 30_000)

  it('laravel: a new locale gets the file of the source locale', async () => {
    const dir = await copy('laravel')
    expect((await x18n(dir, ['set', 'messages.dashboard.title', '--locale', 'de', '--value', 'Übersicht'])).code).toBe(0)
    expect(await read(dir, 'lang/de/messages.php')).toBe('<?php\n\nreturn [\n    \'dashboard\' => [\n        \'title\' => \'Übersicht\',\n    ],\n];\n')
    expect(await read(dir, 'lang/de.json')).not.toContain('dashboard')
  }, 30_000)

  it('rails: lazy lookups stay lazy and new keys go under the locale root', async () => {
    const dir = await copy('rails')
    expect((await x18n(dir, ['rename', 'users.index.title', 'users.index.heading'])).code).toBe(0)
    expect(await read(dir, 'app/views/users/index.html.erb')).toContain('t(".heading")')
    expect((await x18n(dir, ['set', 'shared.save', '--locale', 'es', '--value', 'Guardar'])).code).toBe(0)
    expect(await read(dir, 'config/locales/es.yml')).toContain('es:\n  users:')
    expect(await read(dir, 'config/locales/es.yml')).toContain('  shared:\n    save: Guardar')
  }, 30_000)

  it('i18n-ally: the migrated config loads without installing x18n', async () => {
    const dir = await copy('i18n-ally')
    expect((await x18n(dir, ['migrate', 'i18n-ally'])).code).toBe(0)
    expect(await read(dir, '.vscode/settings.json')).toContain('"x18n.displayLocale": "zh-CN"')
    // `keysInUse` came from the i18n-ally settings, so the dynamic keys are not unused.
    expect(await diagnostics(dir)).toEqual([
      'missing-translation dynamic.a src/lang/en.json:4',
      'missing-translation dynamic.b src/lang/en.json:5',
    ])
  }, 30_000)

  it('extract skips attribute values that are code', async () => {
    const dir = await copy('vue-vite')
    const { stdout } = await x18n(dir, ['extract', '--list', '--json'])
    const items: { text: string }[] = JSON.parse(stdout).data.items
    expect(items.map(item => item.text)).toEqual(['Refresh the page', 'Reload', 'Press enter to save'])
  }, 30_000)
})

interface Position { line: number, character: number }
interface Location { uri: string, range: { start: Position } }

class Client {
  readonly diagnostics = new Map<string, string[]>()
  readonly connection: MessageConnection
  readonly child: ChildProcess

  constructor(readonly root: string) {
    this.child = spawn(process.execPath, [lsp, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] })
    this.connection = createMessageConnection(new StreamMessageReader(this.child.stdout!), new StreamMessageWriter(this.child.stdin!))
    this.connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string, diagnostics: { code: string }[] }) => {
      this.diagnostics.set(this.path(params.uri), params.diagnostics.map(d => d.code))
    })
    this.connection.listen()
  }

  path(uri: string): string {
    return relative(this.root, fileURLToPath(uri)).replace(/\\/g, '/')
  }

  uri(path: string): string {
    return pathToFileURL(join(this.root, path)).href
  }

  async start(): Promise<void> {
    await this.connection.sendRequest('initialize', { processId: null, rootUri: pathToFileURL(this.root).href, capabilities: {} })
    await this.connection.sendNotification('initialized', {})
    await this.connection.sendRequest('x18n/projects')
  }

  async at(path: string, needle: string): Promise<{ textDocument: { uri: string }, position: Position }> {
    const text = await read(this.root, path)
    const lines = text.slice(0, text.indexOf(needle) + 2).split('\n')
    return { textDocument: { uri: this.uri(path) }, position: { line: lines.length - 1, character: lines.at(-1)!.length } }
  }

  where(locations: Location[] | null): string[] {
    return (locations ?? []).map(l => `${this.path(l.uri)}:${l.range.start.line + 1}`)
  }

  stop(): void {
    this.connection.dispose()
    this.child.kill()
  }
}

describe('the language server on the playgrounds', () => {
  it.each([
    ['vue-vite', 'src/App.vue', 'nav.home', ['src/locales/en.json:8']],
    ['react-i18next', 'src/Login.tsx', '\'title\'', ['public/locales/en/auth.json:3']],
    ['react-i18next', 'src/Cart.tsx', '\'item\'', ['public/locales/en/common.json:4']],
    ['next-intl', 'app/[locale]/page.tsx', '\'cta\'', ['messages/en.json:5']],
    ['laravel', 'resources/views/dashboard.blade.php', 'messages.welcome', ['lang/en/messages.php:4']],
    ['rails', 'app/views/users/index.html.erb', '".title"', ['config/locales/en.yml:4']],
    ['angular', 'src/app/app.component.html', '\'HOME.TITLE\'', ['src/assets/i18n/en.json:3']],
  ])('%s: definition from %s', async (name, file, needle, expected) => {
    const client = new Client(await copy(name))
    try {
      await client.start()
      expect(client.where(await client.connection.sendRequest('textDocument/definition', await client.at(file, needle)))).toEqual(expected)
    }
    finally {
      client.stop()
    }
  }, 30_000)

  it('vue-vite: references, rename and live diagnostics', async () => {
    const client = new Client(await copy('vue-vite'))
    try {
      await client.start()
      const fromResource = await client.at('src/locales/en.json', '"pages"')
      expect(client.where(await client.connection.sendRequest('textDocument/references', { ...fromResource, context: { includeDeclaration: true } }))).toEqual([
        'src/App.vue:23',
        'src/locales/en.json:17',
        'src/locales/de.json:16',
      ])
      const edit: { documentChanges: { textDocument: { uri: string } }[] } = await client.connection.sendRequest('textDocument/rename', { ...await client.at('src/App.vue', 'nav.home'), newName: 'nav.start' })
      expect(edit.documentChanges.map(change => client.path(change.textDocument.uri)).sort()).toEqual(['src/App.vue', 'src/locales/de.json', 'src/locales/en.json', 'src/locales/ja.yml'])

      await expect.poll(() => client.diagnostics.get('src/App.vue')).toEqual(['missing-key'])
      const app = await read(client.root, 'src/App.vue')
      await client.connection.sendNotification('textDocument/didOpen', { textDocument: { uri: client.uri('src/App.vue'), languageId: 'vue', version: 1, text: app } })
      await client.connection.sendNotification('textDocument/didChange', { textDocument: { uri: client.uri('src/App.vue'), version: 2 }, contentChanges: [{ text: app.replace('nav.contact', 'nav.home') }] })
      await expect.poll(() => client.diagnostics.get('src/App.vue'), { timeout: 5000 }).toEqual([])
    }
    finally {
      client.stop()
    }
  }, 30_000)
})

import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHostContext } from 'devframe/node'
import { createServer } from 'vite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createX18nDevframe } from '../src/devframe'

const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url))
let dir: string
let root: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'x18n-devtools-'))
  root = join(dir, 'vue-i18n')
  await cp(join(fixtures, 'vue-i18n'), root, { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it('loads the workspace from the hub root', async () => {
  const ctx = await createHostContext({
    cwd: root,
    mode: 'build',
    host: { mountStatic: () => {}, resolveOrigin: () => 'http://localhost', getStorageDir: () => join(dir, '.devframe') },
  })
  await createX18nDevframe().setup(ctx)
  const { projects } = await ctx.scope('x18n').rpc.call('project')
  expect(projects).toMatchObject([{ name: 'vue-i18n', keys: 8 }])
})

it('serves the UI inside Vite DevTools', async () => {
  const server = await createServer({
    root,
    configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  })
  try {
    await server.listen()
    const base = new URL('__x18n/', server.resolvedUrls!.local[0])
    const html = await (await fetch(base)).text()
    expect(html).toContain('<div id="__nuxt">')
    // The SPA loads its assets relative to where the host mounts it.
    const entry = html.match(/src="(\.\/_nuxt\/[^"]+\.js)"/)?.[1]
    expect(entry).toBeDefined()
    expect((await fetch(new URL(entry!, base))).status).toBe(200)
    expect(await (await fetch(new URL('__connection.json', base))).json()).toMatchObject({ backend: 'websocket' })
  }
  finally {
    await server.close()
  }
}, 30_000)

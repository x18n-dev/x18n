import type { Location } from 'vscode-languageserver/node'
import type { ProjectInfo } from '../src'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import { createConnection, InitializeRequest } from 'vscode-languageserver/node'
import { methods, setupServer } from '../src'

const config = JSON.stringify({ resources: [{ pattern: 'locales/{locale}.json' }], usage: { include: ['src/**/*.ts'], calls: [{ callee: 't' }] } })
const files = {
  'apps/web/x18n.config.json': config,
  'apps/web/locales/en.json': '{"title":"Web"}',
  'apps/web/src/a.ts': 't(\'title\')',
  'apps/docs/x18n.config.json': config,
  'apps/docs/locales/en.json': '{"title":"Docs"}',
  'apps/docs/src/a.ts': 't(\'title\')',
}

let root: string
let client: ReturnType<typeof createMessageConnection>
const disposers: (() => void)[] = []
const uri = (path: string): string => pathToFileURL(join(root, path)).href

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'x18n-lsp-monorepo-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const server = createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toClient))
  setupServer(server)
  server.listen()
  client = createMessageConnection(new StreamMessageReader(toClient), new StreamMessageWriter(toServer))
  client.listen()
  disposers.push(() => client.dispose(), () => server.dispose())
  await client.sendRequest(InitializeRequest.type, { processId: null, rootUri: null, workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'monorepo' }], capabilities: {} })
  await client.sendNotification('initialized', {})
})

afterAll(async () => {
  disposers.splice(0).forEach(dispose => dispose())
  await rm(root, { recursive: true, force: true })
})

it('loads every config of a folder without a root config', async () => {
  const projects: ProjectInfo[] = await client.sendRequest(methods.projects)
  expect(projects.map(p => [p.name, p.root])).toEqual([['apps/docs', join(root, 'apps/docs')], ['apps/web', join(root, 'apps/web')]])
})

it.each(['web', 'docs'])('resolves the project of a file in apps/%s', async (app) => {
  const position = { line: 0, character: 4 }
  const definition: Location[] = await client.sendRequest('textDocument/definition', { textDocument: { uri: uri(`apps/${app}/src/a.ts`) }, position })
  expect(definition.map(location => location.uri)).toEqual([uri(`apps/${app}/locales/en.json`)])
  expect(await client.sendRequest(methods.keyAt, { uri: uri(`apps/${app}/src/a.ts`), position })).toMatchObject({ project: `apps/${app}`, key: 'title' })
})

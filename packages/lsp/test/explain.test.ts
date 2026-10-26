import type { LogMessageParams } from 'vscode-languageserver/node'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import { createConnection, InitializeRequest } from 'vscode-languageserver/node'
import { methods, setupServer } from '../src'

const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url))
let root: string
const disposers: (() => void)[] = []

async function start(folders: readonly string[]): Promise<{ explain: () => Promise<string>, logs: string[] }> {
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const server = createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toClient))
  setupServer(server)
  server.listen()
  const client = createMessageConnection(new StreamMessageReader(toClient), new StreamMessageWriter(toServer))
  const logs: string[] = []
  client.onNotification('window/logMessage', (params: LogMessageParams) => {
    logs.push(params.message)
  })
  client.onRequest('window/showMessageRequest', () => null)
  client.listen()
  disposers.push(() => client.dispose(), () => server.dispose())
  await client.sendRequest(InitializeRequest.type, {
    processId: null,
    rootUri: null,
    workspaceFolders: folders.map(folder => ({ uri: pathToFileURL(join(root, folder)).href, name: folder })),
    capabilities: {},
  })
  await client.sendNotification('initialized', {})
  await client.sendRequest(methods.projects)
  return {
    explain: () => client.sendRequest(methods.explain),
    logs,
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'x18n-lsp-explain-'))
  await cp(join(fixtures, 'vue-i18n'), join(root, 'app'), { recursive: true })
  await mkdir(join(root, 'empty'))
  await mkdir(join(root, 'broken'))
  await writeFile(join(root, 'broken/x18n.config.json'), '{')
})

afterAll(async () => {
  disposers.splice(0).forEach(dispose => dispose())
  await rm(root, { recursive: true, force: true })
})

describe('x18n/explain', () => {
  it('explains a project as x18n doctor does', async () => {
    const { explain, logs } = await start(['app'])
    const text = await explain()
    expect(text).toContain(`# app (${join(root, 'app')})`)
    expect(text).toContain('config: none (detection only)')
    expect(text).toContain('  ✓ vue-i18n (detected)')
    expect(text).toContain('    src/locales/en.json')
    expect(logs.join('\n')).not.toContain('No locale files found')
  })

  it('logs the explanation and the load errors when nothing is found', async () => {
    const { explain, logs } = await start(['empty', 'broken'])
    const text = await explain()
    expect(text).toContain(`# ${join(root, 'broken')}\nerror: X18N0002`)
    expect(text).toContain('fix: ')
    expect(text).toContain('config: none (detection only)')
    expect(logs).toContain(`No locale files found in the workspace.\n\n${text}`)
  })
})

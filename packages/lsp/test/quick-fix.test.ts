import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { CodeAction, Diagnostic, PublishDiagnosticsParams } from 'vscode-languageserver/node'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import { createConnection, InitializeRequest } from 'vscode-languageserver/node'
import { methods, setupServer } from '../src'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
})

/** Opens a project and gives the quick fixes of one source file, once the server has published its diagnostics. */
async function quickFixes(files: Record<string, string>, path: string, code: string): Promise<{ codes: (string | number | undefined)[], actions: CodeAction[] }> {
  const root = await mkdtemp(join(tmpdir(), 'x18n-quick-fix-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true })
    await writeFile(join(root, file), content)
  }
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const server = createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toClient))
  setupServer(server)
  server.listen()
  const client: MessageConnection = createMessageConnection(new StreamMessageReader(toClient), new StreamMessageWriter(toServer))
  const published = new Map<string, Diagnostic[]>()
  client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
    published.set(params.uri, params.diagnostics)
  })
  client.listen()
  cleanups.push(() => client.dispose(), () => server.dispose())
  await client.sendRequest(InitializeRequest.type, { processId: null, rootUri: pathToFileURL(root).href, capabilities: {} })
  await client.sendNotification('initialized', {})
  await client.sendRequest(methods.projects)
  const uri = pathToFileURL(join(root, path)).href
  await expect.poll(() => published.get(uri)?.length).toBeGreaterThan(0)
  const diagnostics = published.get(uri)!
  const actions: CodeAction[] = await client.sendRequest('textDocument/codeAction', {
    textDocument: { uri },
    range: {
      start: { line: 0, character: 0 },
      end: { line: code.split('\n').length, character: 0 },
    },
    context: {
      diagnostics,
      only: ['quickfix'],
    },
  })
  return {
    codes: diagnostics.map(d => d.code),
    actions,
  }
}

function project(script: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      dependencies: { 'vue-i18n': '*', 'vue': '*' },
    }),
    'src/locales/en.json': JSON.stringify({
      menu: { open: 'Open' },
      n: 'N',
    }),
    'src/A.vue': `<script setup>\nconst { t } = useI18n()\n${script}\n</script>\n`,
  }
}

describe('quick fixes of a missing key', () => {
  it('offers the fix that adds the key', async () => {
    const script = 't(\'fresh\')\nt(\'menu.open\')\nt(\'n\')'
    const { codes, actions } = await quickFixes(project(script), 'src/A.vue', script)
    expect(codes).toEqual(['missing-key'])
    expect(actions.map(a => a.title)).toEqual(['Add "fresh" to en'])
  })

  it('offers no fix that would change nothing: a key under a message is not added', async () => {
    const script = 't(\'menu.open.deeper\')\nt(\'menu.open\')\nt(\'n\')'
    const { codes, actions } = await quickFixes(project(script), 'src/A.vue', script)
    expect(codes).toEqual(['missing-key'])
    expect(actions).toEqual([])
  })
})

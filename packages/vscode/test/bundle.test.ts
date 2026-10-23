import type { ChildProcess } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const fixture = fileURLToPath(new URL('../../../test/fixtures/vue-i18n', import.meta.url))

/** Minimal JSON-RPC client over stdio: enough to drive the server and record what it logs. */
function connect(child: ChildProcess) {
  const logs: string[] = []
  let settle!: () => void
  /** Settles once project loading ended: either a project published diagnostics or a message reported why not. */
  const loaded = new Promise<void>((resolve) => {
    settle = resolve
  })
  const pending = new Map<number, (result: unknown) => void>()
  let buffer = Buffer.alloc(0)
  let id = 0
  const write = (message: object) => {
    const body = JSON.stringify(message)
    child.stdin!.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  child.stdout!.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const end = buffer.indexOf('\r\n\r\n')
      const length = end < 0
        ? 0
        : Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())?.[1])
      if (!length || buffer.length < end + 4 + length)
        return
      const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString())
      buffer = buffer.subarray(end + 4 + length)
      if (message.method === 'window/logMessage') {
        logs.push(message.params.message)
      }
      else if (message.method === 'window/showMessage' || message.method === 'window/showMessageRequest') {
        logs.push(message.params.message)
        settle()
      }
      else if (message.method === 'x18n/changed' || message.method === 'textDocument/publishDiagnostics') {
        settle()
      }
      else if (message.method && message.id !== undefined) {
        write({
          jsonrpc: '2.0',
          id: message.id,
          result: message.method === 'workspace/configuration'
            ? []
            : null,
        })
      }
      else if (message.id !== undefined) {
        pending.get(message.id)?.(message.result ?? message.error)
      }
    }
  })
  return {
    logs,
    loaded,
    notify: (method: string, params: object) => write({ jsonrpc: '2.0', method, params }),
    request: (method: string, params: object) => new Promise<any>((resolve) => {
      pending.set(++id, resolve)
      write({ jsonrpc: '2.0', id, method, params })
    }),
  }
}

let dir: string
let child: ChildProcess

beforeAll(async () => {
  // The extension ships `dist` alone, without node_modules: run it from a copy in a bare temp dir so a file
  // the bundle still resolves from this repo's `node_modules` (a lazy `require`, a wasm binary) cannot hide.
  dir = await mkdtemp(join(tmpdir(), 'x18n-bundle-'))
  await cp(dist, join(dir, 'dist'), { recursive: true })
  await cp(fixture, join(dir, 'project'), { recursive: true })
  // A TypeScript config goes through jiti, which loads its Babel build lazily.
  await writeFile(join(dir, 'project', 'x18n.config.ts'), 'export default { sourceLocale: \'en\' as string }\n')
})

afterAll(async () => {
  // Windows keeps the temp dir locked until the server has exited.
  if (child?.kill())
    await once(child, 'exit')
  await rm(dir, { recursive: true, force: true })
})

it('serves a project from the bundle alone', async () => {
  const project = join(dir, 'project')
  child = spawn(process.execPath, [
    join(dir, 'dist', 'server.cjs'),
    '--stdio',
  ], { cwd: dir })
  const client = connect(child)
  const rootUri = pathToFileURL(project).href
  await client.request('initialize', {
    processId: process.pid,
    rootUri,
    workspaceFolders: [
      { uri: rootUri, name: 'project' },
    ],
    capabilities: {},
  })
  client.notify('initialized', {})

  await client.loaded

  // One Vue SFC and one TS file cover the template and script parsers.
  for (const file of ['src/App.vue', 'src/main.ts']) {
    const uri = pathToFileURL(join(project, file)).href
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: file.endsWith('.vue')
          ? 'vue'
          : 'typescript',
        version: 1,
        text: await readFile(join(project, file), 'utf8'),
      },
    })
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 999, character: 0 },
    }
    const hints = await client.request('textDocument/inlayHint', {
      textDocument: { uri },
      range,
    })
    expect(Array.isArray(hints), file).toBe(true)
    if (file.endsWith('.vue'))
      expect(hints.length, file).toBeGreaterThan(0)
  }

  const problems = client.logs.filter(log => /cannot find module|could not be loaded|error/i.test(log))
  expect(problems).toEqual([])
})

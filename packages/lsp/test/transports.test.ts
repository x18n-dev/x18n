import type { ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { ProjectInfo } from '../src'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  createMessageConnection,
  IPCMessageReader,
  IPCMessageWriter,
  SocketMessageReader,
  SocketMessageWriter,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node'
import { methods } from '../src'

// The built binary, as an editor starts it; `pnpm test` builds first.
const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'x18n-lsp-transports-'))
  await mkdir(join(root, 'locales'))
  await writeFile(join(root, 'locales/en.json'), '{"title":"Title"}')
  await writeFile(join(root, 'x18n.config.json'), JSON.stringify({
    resources: [
      { pattern: 'locales/{locale}.json' },
    ],
  }))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

async function start(transport: string): Promise<{ child: ChildProcess, connection: MessageConnection }> {
  if (transport === 'stdio') {
    const child = fork(bin, ['--stdio'], { stdio: 'pipe' })
    return {
      child,
      connection: createMessageConnection(new StreamMessageReader(child.stdout!), new StreamMessageWriter(child.stdin!)),
    }
  }
  if (transport === 'node-ipc') {
    const child = fork(bin, ['--node-ipc'], { silent: true })
    return {
      child,
      connection: createMessageConnection(new IPCMessageReader(child), new IPCMessageWriter(child)),
    }
  }
  // With --socket the client listens and the server connects to it.
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const child = fork(bin, [`--socket=${(server.address() as AddressInfo).port}`], { silent: true }) // `address()` is an object for a TCP server
  const [socket] = await once(server, 'connection')
  server.close()
  return {
    child,
    connection: createMessageConnection(new SocketMessageReader(socket), new SocketMessageWriter(socket)),
  }
}

it.each(['stdio', 'node-ipc', 'socket'])('serves over %s', async (transport) => {
  const { child, connection } = await start(transport)
  connection.listen()
  await connection.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {} })
  await connection.sendNotification('initialized', {})
  const projects: ProjectInfo[] = await connection.sendRequest(methods.projects)
  expect(projects.map(p => p.locales.map(l => l.code))).toEqual([
    ['en'],
  ])

  const exited = once(child, 'exit')
  await connection.sendRequest('shutdown')
  await connection.sendNotification('exit')
  expect(await exited).toEqual([0, null])
  connection.dispose()
})

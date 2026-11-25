import type { MessageConnection } from 'vscode-jsonrpc/node'
import type { CodeAction, Diagnostic, InlayHint, PublishDiagnosticsParams, WorkspaceEdit } from 'vscode-languageserver/node'
import type { UnusedDeletionResult } from '../src'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { applyTextEdits, createLineIndex } from '@x18n/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import { createConnection, InitializeRequest } from 'vscode-languageserver/node'
import { methods, setupServer } from '../src'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0))
    await cleanup()
})

interface Session {
  readonly client: MessageConnection
  readonly uri: (path: string) => string
  readonly diagnostics: (path: string) => Diagnostic[] | undefined
  readonly text: Map<string, string>
}

async function open(files: Record<string, string>): Promise<Session> {
  const root = await mkdtemp(join(tmpdir(), 'x18n-arrays-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const server = createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toClient))
  setupServer(server)
  server.listen()
  const client = createMessageConnection(new StreamMessageReader(toClient), new StreamMessageWriter(toServer))
  const published = new Map<string, Diagnostic[]>()
  client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
    published.set(params.uri, params.diagnostics)
  })
  client.listen()
  cleanups.push(() => client.dispose(), () => server.dispose())
  await client.sendRequest(InitializeRequest.type, { processId: null, rootUri: pathToFileURL(root).href, capabilities: {} })
  await client.sendNotification('initialized', {})
  await client.sendRequest(methods.projects)
  const uri = (path: string): string => pathToFileURL(join(root, path)).href
  return {
    client,
    uri,
    diagnostics: path => published.get(uri(path)),
    text: new Map(Object.entries(files)),
  }
}

const pkg = JSON.stringify({
  dependencies: { 'vue-i18n': '*', 'vue': '*' },
})
const en = JSON.stringify({
  list: ['A', 'B', 'C'],
  menu: { open: 'Open' },
  n: 'N',
}, null, 2)

function component(script: string): string {
  return `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`
}

async function arrays(script: string, locales = en): Promise<Session & { code: string }> {
  const code = component(script)
  const session = await open({ 'package.json': pkg, 'src/locales/en.json': locales, 'src/A.vue': code })
  return { ...session, code }
}

async function hints(session: Session, path: string, text: string): Promise<{ after: string, label: string }[]> {
  const index = createLineIndex(text)
  const found: InlayHint[] = await session.client.sendRequest('textDocument/inlayHint', {
    textDocument: {
      uri: session.uri(path),
    },
    range: {
      start: { line: 0, character: 0 },
      end: index.position(text.length),
    },
  })
  return found.map(hint => ({
    after: text.slice(0, index.offset(hint.position)).split('\n').at(-1)!.trimStart(),
    label: String(hint.label).trim(),
  }))
}

async function hover(session: Session, path: string, text: string, needle: string): Promise<string | undefined> {
  const found: { contents: { value: string } } | null = await session.client.sendRequest('textDocument/hover', {
    textDocument: {
      uri: session.uri(path),
    },
    position: createLineIndex(text).position(text.indexOf(needle) + 1),
  })
  return found?.contents.value
}

/** The quick fixes an editor offers on the diagnostics of a file, with the text of each file after its edit. */
async function quickFixes(session: Session, path: string): Promise<{ title: string, files: Record<string, string> }[]> {
  const text = session.text.get(path)!
  const diagnostics = session.diagnostics(path) ?? []
  const actions: CodeAction[] = await session.client.sendRequest('textDocument/codeAction', {
    textDocument: {
      uri: session.uri(path),
    },
    range: {
      start: { line: 0, character: 0 },
      end: createLineIndex(text).position(text.length),
    },
    context: {
      diagnostics,
      only: ['quickfix'],
    },
  })
  return actions.map(action => ({
    title: action.title,
    files: applied(session, action.edit),
  }))
}

function applied(session: Session, edit: WorkspaceEdit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const change of edit?.documentChanges ?? []) {
    if (!('textDocument' in change))
      continue
    const path = [
      ...session.text.keys(),
    ].find(p => session.uri(p) === change.textDocument.uri)!
    const before = session.text.get(path)!
    const index = createLineIndex(before)
    out[path] = applyTextEdits(before, change.edits.flatMap(e => 'newText' in e
      ? [
          {
            range: {
              start: index.offset(e.range.start),
              end: index.offset(e.range.end),
            },
            text: e.newText,
          },
        ]
      : []))
  }
  return out
}

describe('arrays in the language server', () => {
  describe('a key written with brackets, and tm()', () => {
    it('reports no missing key and no unused item', async () => {
      // `nope` is the control: the server publishes only when there is something to report.
      const session = await arrays('tm(\'list\')\nt(\'list[0]\')\nt(\'menu.open\')\nt(\'n\')\nt(\'nope\')')
      await expect.poll(() => session.diagnostics('src/A.vue')?.map(d => d.message)).toEqual(['"nope" is not defined in en.'])
      const plan: UnusedDeletionResult = await session.client.sendRequest(methods.unusedDeletion, {})
      expect(plan.projects[0]!.keys).toEqual([])
    })

    it('shows the value of an item as an annotation', async () => {
      const session = await arrays('t(\'list[1]\')\nt(\'list.2\')')
      expect(await hints(session, 'src/A.vue', session.code)).toEqual([
        { after: 't(\'list[1]\'', label: 'B' },
        { after: 't(\'list.2\'', label: 'C' },
      ])
    })

    it('hovers with the value of an item in each locale', async () => {
      const session = await arrays('t(\'list[1]\')')
      expect(await hover(session, 'src/A.vue', session.code, 'list[1]')).toContain('| 🇺🇸 en | B |')
    })

    it('has a hover and an annotation for the key of a tm() call too', async () => {
      const session = await arrays('tm(\'list\')')
      expect(await hover(session, 'src/A.vue', session.code, 'list')).toBeDefined()
      expect(await hints(session, 'src/A.vue', session.code)).toEqual([
        {
          after: 'tm(\'list\'',
          label: expect.any(String),
        },
      ])
    })
  })

  describe('delete Unused Keys', () => {
    it('plans only the items nothing reads', async () => {
      const session = await arrays('t(\'list[0]\')\nt(\'list[2]\')\nt(\'menu.open\')\nt(\'n\')')
      const plan: UnusedDeletionResult = await session.client.sendRequest(methods.unusedDeletion, {})
      expect(plan.projects[0]!.keys.map(k => k.key)).toEqual(['list.1'])
    })

    it('empties the middle item in the edit it returns', async () => {
      const session = await arrays('t(\'list[0]\')\nt(\'list[2]\')\nt(\'menu.open\')\nt(\'n\')')
      const handler = session.client.onRequest('workspace/applyEdit', () => ({ applied: true }))
      try {
        const edit: WorkspaceEdit = await session.client.sendRequest('workspace/executeCommand', { command: 'x18n.deleteUnused', arguments: [] })
        expect(JSON.parse(applied(session, edit)['src/locales/en.json']!).list).toEqual(['A', '', 'C'])
      }
      finally {
        handler.dispose()
      }
    })
  })

  describe('the quick fix of a missing key', () => {
    it('adds the item right after the last one', async () => {
      const session = await arrays('t(\'list[3]\')\nt(\'list[0]\')\nt(\'list[1]\')\nt(\'list[2]\')\ntm(\'menu\')\nt(\'n\')')
      await expect.poll(() => session.diagnostics('src/A.vue')?.map(d => d.code)).toEqual(['missing-key'])
      const [fix] = await quickFixes(session, 'src/A.vue')
      expect(fix!.title).toBe('Add "list.3" to en')
      expect(JSON.parse(fix!.files['src/locales/en.json']!).list).toEqual(['A', 'B', 'C', ''])
    })

    it('does not leave a gap: the fix of list[9] changes nothing', async () => {
      const session = await arrays('t(\'list[9]\')\ntm(\'list\')\ntm(\'menu\')\nt(\'n\')')
      await expect.poll(() => session.diagnostics('src/A.vue')?.map(d => d.code)).toEqual(['missing-key'])
      const fixes = await quickFixes(session, 'src/A.vue')
      expect(fixes.map(f => f.files)).toEqual([{}])
    })
  })
})

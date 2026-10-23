import type { Connection } from 'vscode-languageserver'
import type { OpenUiResult } from './protocol'
import type { ServerProject } from './server'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createX18nDevframe } from '@x18n/ui'
import { createDevServer } from 'devframe/adapters/dev'
import { getTempAuthCodeInfo } from 'devframe/node/auth'

export interface UiServers {
  readonly open: (entry: ServerProject) => Promise<OpenUiResult>
  readonly close: () => Promise<void>
}

/**
 * One devframe dev server per project, on loopback, sharing the server's `Project`.
 * The token is devframe's one-time code: the webview passes it as the magic link
 * fragment (`#devframe_otp=<token>`), which the UI exchanges for a session.
 */
export function createUiServers(connection: Connection): UiServers {
  const servers = new Map<ServerProject, ReturnType<typeof createDevServer>>()
  return {
    async open(entry) {
      let server = servers.get(entry)
      if (!server) {
        server = createDevServer(createX18nDevframe([entry], {
          openInEditor: async ({ path, line, column }) => {
            const position = { line: line - 1, character: column - 1 }
            await connection.window.showDocument({
              uri: pathToFileURL(join(entry.root, path)).href,
              takeFocus: true,
              selection: { start: position, end: position },
            })
          },
        }), {
          host: '127.0.0.1',
          port: 0,
          auth: true,
          openBrowser: false,
        })
        servers.set(entry, server)
      }
      return { url: `${(await server).origin}/`, token: getTempAuthCodeInfo().code }
    },
    async close() {
      await Promise.all([
        ...servers.values(),
      ].map(async server => (await server).close()))
      servers.clear()
    },
  }
}

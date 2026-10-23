import type { GlobalOptions } from '../context'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createX18nDevframe } from '@x18n/ui'
import { createBuild } from 'devframe/adapters/build'
import { createDevServer } from 'devframe/adapters/dev'
import { createMcpServer } from 'devframe/adapters/mcp'
import { buildOtpAuthUrl, getTempAuthCodeInfo } from 'devframe/node/auth'
import { randomToken } from 'devframe/utils/crypto-token'
import { launchEditor } from 'devframe/utils/launch-editor'
import { cwd, openWorkspace, out, printJson } from '../context'

export interface UiCommandOptions extends GlobalOptions {
  readonly port?: number | undefined
  readonly host?: string | undefined
  readonly open?: boolean | undefined
  readonly auth?: boolean | undefined
}

/** Starts the UI dev server and keeps running until interrupted. */
export async function ui(options: UiCommandOptions): Promise<void> {
  const workspace = await openWorkspace(options)
  workspace.projects.forEach(p => p.project.watch())
  // Without a configured editor, launch-editor detects a running one.
  const editor = process.env.LAUNCH_EDITOR || process.env.VISUAL || process.env.EDITOR || undefined
  const definition = createX18nDevframe(workspace.projects, {
    openInEditor: async ({ project, path, line, column }) => launchEditor(`${join(project.root, path)}:${line}:${column}`, editor),
  })
  const mcpToken = randomToken()
  const auth = options.auth !== false
  if (!auth)
    process.stderr.write('warning: --no-auth lets anything that reaches the port edit your files. Use it only in CI and e2e tests.\n')
  const server = await createDevServer(definition, {
    host: options.host ?? 'localhost',
    ...options.port === undefined
      ? {}
      : {
          port: Number(options.port),
        },
    auth,
    openBrowser: options.open !== false,
    mcp: { authorization: mcpToken },
  })
  const url = `${server.origin}/`
  const code = auth
    ? getTempAuthCodeInfo().code
    : undefined
  const mcp = { url: `${url}__mcp`, token: mcpToken }
  if (options.json) {
    printJson('ui', {
      url,
      code,
      link: code && buildOtpAuthUrl(url, code),
      mcp,
    })
  }
  else {
    out(`x18n UI at ${url}`)
    if (code)
      out(`  auth code  ${code}\n  or open    ${buildOtpAuthUrl(url, code)}`)
    out(`  MCP        ${mcp.url}\n  MCP token  Authorization: Bearer ${mcp.token}`)
  }
  const stop = (): void => {
    void server.close().finally(() => process.exit(0))
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

export async function build(options: GlobalOptions & { readonly outDir?: string | undefined }): Promise<void> {
  const workspace = await openWorkspace(options)
  const outDir = resolve(cwd(), options.outDir ?? '.x18n/report')
  // devframe reports progress with `console.log`; stdout is for the result (and the `--json` envelope).
  const log = console.log
  console.log = console.error
  try {
    await createBuild(createX18nDevframe(workspace.projects), { outDir })
  }
  finally {
    console.log = log
  }
  if (options.json)
    printJson('build', { outDir })
  else
    out(`Wrote the report to ${outDir}`)
}

/** MCP over stdio: stdout is the transport, so nothing else may print there. */
export async function mcp(options: GlobalOptions): Promise<void> {
  const workspace = await openWorkspace(options)
  workspace.projects.forEach(p => p.project.watch())
  await createMcpServer(createX18nDevframe(workspace.projects), { transport: 'stdio', serverName: 'x18n' })
}

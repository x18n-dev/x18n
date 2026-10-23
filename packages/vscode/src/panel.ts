import type { WebviewPanel } from 'vscode'
import type { KeyRef, X18nClient } from './model/client'
import { randomBytes } from 'node:crypto'
import { useDisposable } from 'reactive-vscode'
import { env, Uri, ViewColumn, window } from 'vscode'
import { frameUrl, panelHtml, uiTheme } from './model/panel'

/** The x18n UI in a webview panel, reused across calls; `open(ref)` shows a project or a key. */
export function useUiPanel(x18n: X18nClient): { open: (ref?: Partial<KeyRef>) => Promise<void> } {
  let panel: WebviewPanel | undefined

  useDisposable(window.onDidChangeActiveColorTheme(({ kind }) => {
    void panel?.webview.postMessage({ type: 'x18n:theme', theme: uiTheme(kind) })
  }))

  async function open(ref?: Partial<KeyRef>): Promise<void> {
    const { url, token } = await x18n.request('x18n/openUi', { project: ref?.project })
    const external = await env.asExternalUri(Uri.parse(url))
    const src = frameUrl(external.toString(true), { token, theme: uiTheme(window.activeColorTheme.kind), lang: env.language, key: ref?.key })
    if (!panel) {
      panel = window.createWebviewPanel('x18n.ui', 'x18n', ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true })
      panel.onDidDispose(() => panel = undefined)
    }
    panel.title = ref?.key ? `x18n: ${ref.key}` : 'x18n'
    panel.webview.html = panelHtml(src, randomBytes(16).toString('base64'))
    panel.reveal()
  }

  useDisposable({ dispose: () => panel?.dispose() })
  return { open }
}

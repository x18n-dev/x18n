export type UiTheme = 'dark' | 'light' | 'high-contrast'

/** Maps `vscode.ColorThemeKind` (1 light, 2 dark, 3 high contrast, 4 high contrast light). */
export function uiTheme(kind: number): UiTheme {
  return kind === 1
    ? 'light'
    : kind === 2
      ? 'dark'
      : 'high-contrast'
}

/**
 * The iframe URL, with the editor's theme and display language. The token goes in the fragment as devframe's magic link (`devframe_otp`), so it never reaches
 * requests or logs. A fragment can hold only URL params for devframe to strip the code and keep the rest, so the
 * key route rides along as `route=/keys/<key>`.
 */
export function frameUrl(base: string, options: { token: string, theme: UiTheme, lang: string, key?: string | undefined }): string {
  const url = new URL(base)
  url.searchParams.set('theme', options.theme)
  url.searchParams.set('lang', options.lang)
  const fragment = new URLSearchParams({ devframe_otp: options.token })
  if (options.key !== undefined)
    fragment.set('route', `/keys/${encodeURIComponent(options.key)}`)
  url.hash = fragment.toString()
  return url.href
}

const escapeAttr = (text: string): string => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Webview document: a full-size iframe of the UI, plus a script forwarding theme changes from the extension. */
export function panelHtml(src: string, nonce: string): string {
  const origin = new URL(src).origin
  const csp = `default-src 'none'; frame-src ${origin}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'`
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<style>html, body, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100%; overflow: hidden; }</style>
</head>
<body>
<iframe id="ui" src="${escapeAttr(src)}" allow="clipboard-read; clipboard-write"></iframe>
<script nonce="${nonce}">
const frame = document.getElementById('ui')
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow && event.data && event.data.type === 'x18n:theme')
    frame.contentWindow.postMessage({ type: 'x18n:theme', theme: event.data.theme }, ${JSON.stringify(origin)})
})
</script>
</body>
</html>`
}

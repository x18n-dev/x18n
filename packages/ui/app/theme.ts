type Theme = 'dark' | 'light' | 'high-contrast'

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light' || value === 'high-contrast'
}

function apply(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme !== 'light')
  root.classList.toggle('high-contrast', theme === 'high-contrast')
}

/** `?theme=` picks the theme (the VS Code panel sets it); the embedding editor updates it with `postMessage`. */
export function setupTheme(): void {
  const requested = new URLSearchParams(location.search).get('theme')
  apply(isTheme(requested)
    ? requested
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light')
  window.addEventListener('message', (event: MessageEvent<{ type?: unknown, theme?: unknown }>) => {
    if (event.source === window.parent && event.source !== window && event.data?.type === 'x18n:theme' && isTheme(event.data.theme))
      apply(event.data.theme)
  })
}

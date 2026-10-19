import { describe, expect, it } from 'vitest'
import { hasI18nAllySettings, parseMigrationResult } from '../src/model/migration'
import { frameUrl, panelHtml, uiTheme } from '../src/model/panel'

describe('frameUrl', () => {
  it('passes the theme in the query and the token as a devframe magic link', () => {
    const url = new URL(frameUrl('http://127.0.0.1:5173/', { token: '123456', theme: 'dark', key: 'app.title' }))
    expect(url.searchParams.get('theme')).toBe('dark')
    const fragment = new URLSearchParams(url.hash.slice(1))
    expect(fragment.get('devframe_otp')).toBe('123456')
    expect(fragment.get('route')).toBe('/keys/app.title')
  })

  it('maps color theme kinds', () => {
    expect([1, 2, 3, 4].map(uiTheme)).toEqual(['light', 'dark', 'high-contrast', 'high-contrast'])
  })
})

describe('panelHtml', () => {
  it('allows framing the UI origin only', () => {
    const html = panelHtml('http://127.0.0.1:5173/?theme=dark#devframe_otp=1', 'abc')
    expect(html).toContain('frame-src http://127.0.0.1:5173;')
    expect(html).toContain('script-src \'nonce-abc\'')
    expect(html).toContain('src="http://127.0.0.1:5173/?theme=dark#devframe_otp=1"')
  })
})

describe('i18n-ally migration', () => {
  it('detects i18n-ally settings', () => {
    expect(hasI18nAllySettings('{\n  // comment\n  "i18n-ally.localesPaths": ["locales"]\n}')).toBe(true)
    expect(hasI18nAllySettings('{\n  "i18n-ally-next.localesPaths": ["locales"]\n}')).toBe(true)
    expect(hasI18nAllySettings('{ "editor.tabSize": 2 }')).toBe(false)
  })

  it('validates the server result', () => {
    expect(parseMigrationResult({ files: [{ path: 'x18n.config.ts', content: 'x' }, { path: 1 }], notes: ['n', 2] }))
      .toEqual({ files: [{ path: 'x18n.config.ts', content: 'x' }], notes: ['n'] })
    expect(parseMigrationResult(null)).toBeUndefined()
  })
})

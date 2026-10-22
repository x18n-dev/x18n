import type { Decoration } from '@x18n/lsp'
import type { DecorationOptions, Event, TextEditor, TextEditorDecorationType, ThemableDecorationRenderOptions } from 'vscode'
import type { X18nClient } from './model/client'
import type { InPlace } from './model/inplace'
import { useDisposable, watch } from 'reactive-vscode'
import { Range, ThemeColor, window, workspace } from 'vscode'
import { annotationInPlace, config } from './config'
import { computeInPlace } from './model/inplace'

function toRange(r: { start: { line: number, character: number }, end: { line: number, character: number } }): Range {
  return new Range(r.start.line, r.start.character, r.end.line, r.end.character)
}

export interface Annotations {
  readonly decorations: (uri: string) => Promise<readonly Decoration[]>
  /** What in-place mode draws in a document right now; read by the e2e suite. */
  readonly inPlace: (uri: string) => InPlace
}

interface ColorTypes {
  readonly value: TextEditorDecorationType
  readonly fullMatch: TextEditorDecorationType
  readonly missing: TextEditorDecorationType
}

/** Decoration types for the `x18n.theme.*` colors; empty settings use the theme's colors and no border. */
function colorTypes(): ColorTypes {
  const { theme } = config
  // `border` is raw CSS, so the radius rides along, as in i18n-ally.
  const border = (color: string): ThemableDecorationRenderOptions => color ? { border: `0.5px solid ${color}; border-radius: 2px;` } : {}
  const value = (color: string): TextEditorDecorationType => window.createTextEditorDecorationType({ before: { color: color || new ThemeColor('editorInlayHint.foreground'), ...border(theme.annotationBorder) } })
  return {
    value: value(theme.annotation),
    fullMatch: value(theme.annotationInPlaceFullMatch || theme.annotation),
    missing: window.createTextEditorDecorationType({ color: theme.annotationMissing || new ThemeColor('editorWarning.foreground'), ...border(theme.annotationMissingBorder) }),
  }
}

/** In-place annotations: hide the key text and show the display-locale value, except on lines with the cursor or a selection. */
export function useAnnotations(x18n: X18nClient, refresh: Event<void>): Annotations {
  // Two types on the same range, as i18n-ally did: one injects the value before the key, the other hides the key.
  const hideType = useDisposable(window.createTextEditorDecorationType({ textDecoration: 'none; display: none;' }))
  let colors = colorTypes()
  const disposeColors = (): void => Object.values(colors).forEach(type => type.dispose())
  useDisposable({ dispose: disposeColors })
  const cache = new Map<string, Promise<readonly Decoration[]>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const enabled = (): boolean => config.annotations && annotationInPlace()

  function decorations(uri: string): Promise<readonly Decoration[]> {
    let pending = cache.get(uri)
    if (!pending) {
      pending = x18n.request('x18n/decorations', { uri }).then(r => r.decorations, () => [])
      cache.set(uri, pending)
    }
    return pending
  }

  const state = new Map<string, readonly Decoration[]>()
  function inPlace(uri: string, editor?: TextEditor): InPlace {
    return computeInPlace(enabled() ? state.get(uri) ?? [] : [], editor?.selections ?? [], { maxLength: config.annotationMaxLength, fullMatch: config.annotationInPlaceFullMatch })
  }

  function render(editor: TextEditor): void {
    const { replaced, missing } = inPlace(editor.document.uri.toString(), editor)
    const values = (fullMatch: boolean): DecorationOptions[] => replaced.filter(r => r.fullMatch === fullMatch).map(r => ({ range: toRange(r.range), renderOptions: { before: { contentText: r.text } } }))
    editor.setDecorations(colors.value, values(false))
    editor.setDecorations(colors.fullMatch, values(true))
    editor.setDecorations(hideType, replaced.map(r => toRange(r.range)))
    editor.setDecorations(colors.missing, missing.map(toRange))
  }

  async function load(uri: string): Promise<void> {
    if (!uri.startsWith('file:'))
      return
    state.set(uri, await decorations(uri))
    for (const editor of window.visibleTextEditors) {
      if (editor.document.uri.toString() === uri)
        render(editor)
    }
  }

  function reload(): void {
    cache.clear()
    for (const uri of new Set(window.visibleTextEditors.map(e => e.document.uri.toString())))
      void load(uri)
  }

  useDisposable(refresh(reload))
  useDisposable(window.onDidChangeVisibleTextEditors(editors => editors.forEach(e => void load(e.document.uri.toString()))))
  useDisposable(window.onDidChangeTextEditorSelection(e => render(e.textEditor)))
  useDisposable(workspace.onDidChangeTextDocument(({ document }) => {
    const uri = document.uri.toString()
    clearTimeout(timers.get(uri))
    // The server re-scans 100 ms after a change; ask after it.
    timers.set(uri, setTimeout(() => {
      cache.delete(uri)
      void load(uri)
    }, 300))
  }))
  useDisposable(workspace.onDidCloseTextDocument(({ uri }) => {
    cache.delete(uri.toString())
    state.delete(uri.toString())
  }))
  watch(() => [config.annotations, annotationInPlace(), config.annotationInPlaceFullMatch, config.annotationMaxLength], () => window.visibleTextEditors.forEach(render))
  // Separate sources, so other `x18n.*` changes do not recreate the types.
  watch([() => config.theme.annotation, () => config.theme.annotationMissing, () => config.theme.annotationBorder, () => config.theme.annotationMissingBorder, () => config.theme.annotationInPlaceFullMatch], () => {
    disposeColors()
    colors = colorTypes()
    window.visibleTextEditors.forEach(render)
  })

  return { decorations, inPlace: uri => inPlace(uri) }
}

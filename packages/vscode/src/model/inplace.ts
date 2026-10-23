import type { Decoration, Range } from '@x18n/lsp'

export interface InPlace {
  /** Text hidden and replaced by `text`: the key, or the whole call with `fullMatch`. */
  readonly replaced: readonly { readonly range: Range, readonly text: string, readonly fullMatch: boolean }[]
  /** Keys with no value, shown as the raw key in a warning color. */
  readonly missing: readonly Range[]
}

export interface InPlaceOptions {
  readonly maxLength: number
  /** Replace the whole call where the server knows it (`x18n.annotationInPlaceFullMatch`). */
  readonly fullMatch: boolean
}

const singleLine = (range: Range): boolean => range.start.line === range.end.line

/** Whether in-place mode handles the decoration; the rest falls back to the server's inlay hints. */
function coveredByInPlace(decoration: Decoration, maxLength: number): boolean {
  if (decoration.state === 'missing')
    return true
  return decoration.state === 'ok' && singleLine(decoration.range) && decoration.value !== undefined && decoration.value.length <= maxLength
}

function revealed(range: Range, selections: readonly Range[]): boolean {
  return selections.some(s => range.start.line <= s.end.line && range.end.line >= s.start.line)
}

/** Splits decorations into what to draw; keys on a line touched by a selection or the cursor stay raw. */
export function computeInPlace(decorations: readonly Decoration[], selections: readonly Range[], options: InPlaceOptions): InPlace {
  const replaced: { range: Range, text: string, fullMatch: boolean }[] = []
  const missing: Range[] = []
  for (const decoration of decorations) {
    if (decoration.state === 'missing') {
      missing.push(decoration.range)
      continue
    }
    if (decoration.value === undefined || !coveredByInPlace(decoration, options.maxLength))
      continue
    // A call over several lines cannot be hidden cleanly; such keys keep the key-only replacement.
    const call = options.fullMatch && decoration.expression && singleLine(decoration.expression)
      ? decoration.expression
      : undefined
    const range = call ?? decoration.range
    if (!revealed(range, selections)) {
      replaced.push({
        range,
        text: decoration.value.replace(/\s*\n\s*/g, ' '),
        fullMatch: call !== undefined,
      })
    }
  }
  return { replaced, missing }
}

/** Whether an inlay hint sits right after a key that in-place mode already shows (hints go one past the closing quote). */
export function hintCovered(position: { line: number, character: number }, decorations: readonly Decoration[], maxLength: number): boolean {
  return decorations.some(d => d.range.end.line === position.line && d.range.end.character + 1 === position.character && coveredByInPlace(d, maxLength))
}

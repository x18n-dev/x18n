import type { MessageLeaf, TextRange } from '@x18n/core'

/** One indent level: the configured one, else the file's first indented line, else `fallback`. */
export function indentUnit(text: string, indent: number | 'tab' | undefined, fallback: string): string {
  if (indent !== undefined) {
    return indent === 'tab'
      ? '\t'
      : ' '.repeat(indent)
  }
  return /^([ \t]+)\S/m.exec(text)?.[1] ?? fallback
}

export function detectEol(text: string): string {
  return text.includes('\r\n')
    ? '\r\n'
    : '\n'
}

export function toLeaf(value: unknown): MessageLeaf | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (value instanceof Date)
    return value.toISOString()
  return undefined
}

export function leafText(value: MessageLeaf): string {
  return value === null
    ? ''
    : String(value)
}

export function splice(text: string, range: TextRange, insert: string): string {
  return text.slice(0, range.start) + insert + text.slice(range.end)
}

/** Appends `chunk` on a line of its own, in the file's line endings. */
export function appendLines(text: string, chunk: string): string {
  const eol = detectEol(text)
  const base = text === '' || text.endsWith('\n')
    ? text
    : text + eol
  return base + chunk.replace(/\n/g, eol)
}

export interface TextLine {
  readonly start: number
  /** End of the content, before the line break. */
  readonly end: number
  /** Start of the next line. */
  readonly next: number
}

export function splitLines(text: string): TextLine[] {
  const out: TextLine[] = []
  let start = 0
  while (start < text.length) {
    const lf = text.indexOf('\n', start)
    const next = lf === -1
      ? text.length
      : lf + 1
    const end = lf === -1
      ? text.length
      : lf > start && text[lf - 1] === '\r'
        ? lf - 1
        : lf
    out.push({ start, end, next })
    start = next
  }
  return out
}

/** An entry's range widened to swallow the blank lines that separate it, so deleting it leaves one separator. */
export function withBlankLines(text: string, range: TextRange): TextRange {
  const after = /^(?:[ \t]*\r?\n)*(?:[ \t]*$)?/.exec(text.slice(range.end))![0].length
  if (range.end + after < text.length)
    return { start: range.start, end: range.end + after }
  const before = /(?<=\n)(?:[ \t]*\r?\n)+$/.exec(text.slice(0, range.start))?.[0].length ?? 0
  return { start: range.start - before, end: text.length }
}

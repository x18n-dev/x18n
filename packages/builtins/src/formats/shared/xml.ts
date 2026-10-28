import type { TextRange } from '@x18n/core'

const entities: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: '\'',
}

/** Text of XML content: entities and character references decoded, CDATA unwrapped, line breaks as `\n`. */
export function decodeXml(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[\da-f]+|#\d+|\w+);/gi, (match, cdata: string | undefined, name: string | undefined) => {
    if (name === undefined)
      return cdata ?? match
    if (name.startsWith('#')) {
      const code = name[1] === 'x' || name[1] === 'X'
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10)
      return code <= 0x10FFFF
        ? String.fromCodePoint(code)
        : match
    }
    return entities[name] ?? match
  })
}

export const escapeXmlText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const escapeXmlAttribute = (text: string): string => escapeXmlText(text).replace(/"/g, '&quot;')

/** The value of attribute `name` in an attribute list, and its range relative to the list. */
export function xmlAttribute(attributes: string, name: string): { value: string, range: TextRange } | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'd').exec(attributes)
  if (!match)
    return undefined
  const at = match.indices![1] ?? match.indices![2]!
  return {
    value: decodeXml(match[1] ?? match[2]!),
    range: { start: at[0], end: at[1] },
  }
}

export interface XmlElement {
  /** The whole element. */
  readonly range: TextRange
  /** Between the start and end tags; empty for `<x/>`. */
  readonly inner: TextRange
  readonly attributes: string
  readonly selfClosing: boolean
}

/** Elements named `name` in `text` from `from` to `to`, skipping comments; nested elements of the same name are not supported. */
export function xmlElements(text: string, name: string, from: number = 0, to: number = text.length): XmlElement[] {
  const out: XmlElement[] = []
  const open = new RegExp(`<!--[\\s\\S]*?-->|<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*?)(/?)>`, 'g')
  const close = new RegExp(`</${name}\\s*>`, 'g')
  open.lastIndex = from
  for (let match = open.exec(text); match && match.index < to; match = open.exec(text)) {
    if (match[1] === undefined)
      continue
    const start = match.index
    const afterOpen = start + match[0].length
    if (match[2]) {
      out.push({
        range: { start, end: afterOpen },
        inner: { start: afterOpen, end: afterOpen },
        attributes: match[1],
        selfClosing: true,
      })
      continue
    }
    close.lastIndex = afterOpen
    const end = close.exec(text)
    if (!end || end.index >= to)
      break
    out.push({
      range: { start, end: end.index + end[0].length },
      inner: { start: afterOpen, end: end.index },
      attributes: match[1],
      selfClosing: false,
    })
    open.lastIndex = end.index + end[0].length
  }
  return out
}

/** The first `name` element within `range`. */
export function xmlChild(text: string, name: string, range: TextRange): XmlElement | undefined {
  return xmlElements(text, name, range.start, range.end)[0]
}

const isSpace = (char: string | undefined): boolean => char === ' ' || char === '\t'

/** The range with its indent and line break when it stands on a line of its own. */
export function xmlLine(text: string, range: TextRange): TextRange {
  let start = range.start
  while (isSpace(text[start - 1]))
    start--
  let end = range.end
  while (isSpace(text[end]))
    end++
  if (text[end] === '\r')
    end++
  if (text[end] === '\n')
    end++
  const ownLine = (start === 0 || text[start - 1] === '\n') && (end === text.length || text[end - 1] === '\n')
  return ownLine
    ? { start, end }
    : range
}

/** The indent of the line holding `offset`. */
export function indentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(text.slice(lineStart))![0]
}

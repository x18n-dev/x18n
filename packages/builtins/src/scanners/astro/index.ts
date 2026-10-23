import type { HardString, Plugin, Scanner, ScanResult, TextRange, UsageCandidate } from '@x18n/core'
import { isTextAttribute, loadParser, scanSource } from '../shared/js'

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/**
 * Splits an Astro template into the parts the `js` scanner reads: top-level `{...}` expressions and
 * `<script>` contents, plus text and text attributes as hard strings. Markup inside an expression
 * (`{items.map(i => <li>{t(i)}</li>)}`) stays in the expression, which oxc parses as JSX.
 */
class AstroTemplate {
  readonly expressions: TextRange[] = []
  readonly scripts: TextRange[] = []
  readonly hardStrings: HardString[] = []

  constructor(readonly text: string, readonly textAttributes: readonly string[] | undefined) {}

  /** Index after the first `token` from `i`, or the end of the text. */
  after(i: number, token: string): number {
    const at = this.text.indexOf(token, i)
    return at < 0
      ? this.text.length
      : at + token.length
  }

  /** Index after the run of characters matching `pattern` (sticky) at `i`. */
  skip(pattern: RegExp, i: number): number {
    pattern.lastIndex = i
    return pattern.test(this.text)
      ? pattern.lastIndex
      : i
  }

  /** Markup from `i`. At the top level it records what it finds; nested in an expression it returns after its closing tag. */
  markup(i: number, nested: boolean): number {
    const { text } = this
    let textStart = i
    while (i < text.length) {
      const c = text[i]
      const next = text[i + 1] ?? ''
      if (c !== '{' && c !== '<') {
        i++
        continue
      }
      let end: number
      if (c === '{') {
        end = this.expression(i, nested)
      }
      else if (text.startsWith('<!--', i)) {
        end = this.after(i, '-->')
      }
      // Closing tags, `<!DOCTYPE html>`.
      else if (next === '/' || next === '!' || next === '?') {
        end = this.after(i, '>')
      }
      else if (/[a-z>]/i.test(next)) {
        end = this.element(i, nested)
      }
      else {
        i++
        continue
      }
      if (!nested)
        this.textNode(textStart, i)
      if (nested && c === '<' && next === '/')
        return end
      i = textStart = end
    }
    if (!nested)
      this.textNode(textStart, i)
    return i
  }

  element(i: number, nested: boolean): number {
    const { text } = this
    const nameEnd = this.skip(/[^\s/>{]*/y, i + 1)
    const name = text.slice(i + 1, nameEnd).toLowerCase()
    let j = nameEnd
    while (j < text.length) {
      j = this.skip(/\s*/y, j)
      if (text[j] === '>' || text.startsWith('/>', j))
        break
      if (text[j] === '{') {
        j = this.expression(j, nested)
        continue
      }
      const attributeStart = j
      j = Math.max(this.skip(/[^\s=>/{]+/y, j), j + 1)
      if (text[j] !== '=')
        continue
      const attribute = text.slice(attributeStart, j)
      const quote = text[++j]
      if (quote === '{') {
        j = this.expression(j, nested)
      }
      else if (quote === '`') {
        // A template literal attribute is itself an expression.
        const end = this.template(j) + 1
        if (!nested)
          this.expressions.push({ start: j, end })
        j = end
      }
      else if (quote === '"' || quote === '\'') {
        const end = this.after(j + 1, quote)
        const value = text.slice(j + 1, end - 1)
        if (!nested && isTextAttribute(attribute, this.textAttributes) && /\p{L}/u.test(value)) {
          this.hardStrings.push({
            text: value,
            range: { start: attributeStart, end },
            kind: 'astro-attribute',
            attribute,
          })
        }
        j = end
      }
      else {
        j = this.skip(/[^\s>]*/y, j)
      }
    }
    const selfClosing = text.startsWith('/>', j)
    const end = Math.min(j + (selfClosing ? 2 : 1), text.length)
    if (name === 'script' || name === 'style') {
      const close = new RegExp(`</${name}`, 'gi')
      close.lastIndex = end
      const closeStart = close.exec(text)?.index ?? text.length
      if (name === 'script' && !nested)
        this.scripts.push({ start: end, end: closeStart })
      return this.after(closeStart, '>')
    }
    if (!nested || selfClosing || voidElements.has(name))
      return end
    return this.markup(end, true)
  }

  /** `{...}` at `i`; returns the index after its `}`. */
  expression(i: number, nested: boolean): number {
    const close = this.js(i + 1)
    if (!nested)
      this.expressions.push({ start: i + 1, end: close })
    return close + 1
  }

  /** Index of the `}` that closes JS code starting at `i`, past strings, comments and JSX. */
  js(i: number): number {
    const { text } = this
    let depth = 0
    let previous = '('
    for (; i < text.length; i++) {
      const c = text[i]!
      if (c === '"' || c === '\'') {
        i = this.literal(i, c)
      }
      else if (c === '`') {
        i = this.template(i)
      }
      else if (text.startsWith('//', i)) {
        i = this.after(i, '\n') - 1
      }
      else if (text.startsWith('/*', i)) {
        i = this.after(i, '*/') - 1
      }
      else if (c === '/' && this.startsOperand(i, previous)) {
        i = this.literal(i, '/')
      }
      else if (c === '{') {
        depth++
      }
      else if (c === '}') {
        if (depth-- === 0)
          return i
      }
      // `<` after a value is less-than or a type argument; elsewhere it opens JSX.
      else if (c === '<' && /[a-z>]/i.test(text[i + 1] ?? '') && this.startsOperand(i, previous)) {
        i = this.element(i, true) - 1
        previous = '>'
        continue
      }
      if (!/\s/.test(c))
        previous = c
    }
    return text.length
  }

  /** Whether `i` starts a value rather than continuing one: `<` opens JSX and `/` a regex there, after a value they are operators. */
  startsOperand(i: number, previous: string): boolean {
    return !/[\w$)\]]/.test(previous) || /\breturn\s*$/.test(this.text.slice(Math.max(0, i - 10), i))
  }

  /** Index of the `quote` that closes the string or regex literal at `i`, past escapes and regex classes. */
  literal(i: number, quote: string): number {
    const { text } = this
    let inClass = false
    for (i++; i < text.length; i++) {
      const c = text[i]
      if (c === '\\')
        i++
      else if (quote === '/' && (c === '[' || c === ']'))
        inClass = c === '['
      else if (c === quote && !inClass)
        return i
    }
    return text.length
  }

  /** Index of the backtick that closes the template literal at `i`. */
  template(i: number): number {
    const { text } = this
    for (i++; i < text.length; i++) {
      if (text[i] === '\\')
        i++
      else if (text[i] === '`')
        return i
      else if (text.startsWith('${', i))
        i = this.js(i + 2)
    }
    return text.length
  }

  textNode(start: number, end: number): void {
    const data = this.text.slice(start, end)
    const text = data.trim()
    if (!/\p{L}/u.test(text))
      return
    const at = start + data.indexOf(text)
    this.hardStrings.push({
      text,
      range: { start: at, end: at + text.length },
      kind: 'astro-text',
    })
  }
}

/** Astro components: the `---` frontmatter, `<script>` and template expressions through the `js` scanner. */
export function astro(): Plugin {
  const scanner: Scanner = {
    id: 'astro',
    extensions: ['astro'],
    async scan(file, ctx) {
      const parse = await loadParser()
      const { text } = file
      const usages: UsageCandidate[] = []
      const keySlots: TextRange[] = []
      const hardStrings: HardString[] = []
      const add = (range: TextRange, filename: string, expression: boolean, reportHardStrings: boolean): void => {
        let result: ScanResult
        try {
          result = scanSource(parse, text.slice(range.start, range.end), {
            calls: ctx.calls,
            ignoreCallees: ctx.config.extract.ignoreCallees,
            textAttributes: ctx.config.extract.attributes,
            offset: range.start,
            filename,
            expression,
            hardStrings: reportHardStrings,
          })
        }
        catch {
          // Code that is not plain TS or JSX, such as HTML comments inside an expression, holds no keys we can read.
          return
        }
        usages.push(...result.usages)
        keySlots.push(...result.keySlots ?? [])
        hardStrings.push(...result.hardStrings ?? [])
      }
      let templateStart = 0
      const open = /^\s*---/.exec(text)
      if (open) {
        const close = /^---/gm
        close.lastIndex = open[0].length
        const end = close.exec(text)?.index ?? text.length
        add({ start: open[0].length, end }, 'frontmatter.ts', false, true)
        templateStart = end + 3
      }
      const template = new AstroTemplate(text, ctx.config.extract.attributes)
      template.markup(templateStart, false)
      // A replacement in browser code could not reach the frontmatter import, and `is:inline` scripts cannot import.
      for (const range of template.scripts)
        add(range, 'script.ts', false, false)
      for (const range of template.expressions)
        add(range, 'template.tsx', true, false)
      hardStrings.push(...template.hardStrings)
      return { usages, keySlots, hardStrings }
    },
  }
  return {
    name: 'x18n:scanner-astro',
    scanners: [scanner],
  }
}

export default astro

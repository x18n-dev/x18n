import type { AttributeNode, DirectiveNode, ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-core'
import type { CallSpec, HardString, Plugin, Scanner, ScanResult, TextRange, UsageCandidate } from '@x18n/core'
import { loadParser, scanSource } from './js'

type SfcCompiler = typeof import('@vue/compiler-sfc')
let compiler: Promise<SfcCompiler> | undefined

export function loadVueCompiler(): Promise<SfcCompiler> {
  compiler ??= import('@vue/compiler-sfc')
  return compiler
}

// Raw template AST node types of @vue/compiler-core.
const ELEMENT = 1
const TEXT = 2
const SIMPLE_EXPRESSION = 4
const INTERPOLATION = 5
const ATTRIBUTE = 6

/** `keypath` is the vue-i18n prop for a key, on `<i18n-t>` and on the app's own wrappers of it; `path` on the legacy components. */
function isKeyAttribute(tag: string, name: string): boolean {
  return name === 'keypath' || (name === 'path' && (tag === 'i18n' || tag === 'i18n-d'))
}
const ignoredAttributes = new Set(['class', 'style', 'key', 'ref', 'id', 'name', 'type', 'href', 'src', 'to', 'for', 'role', 'lang', 'target', 'rel', 'is', 'slot'])

interface Collected {
  usages: UsageCandidate[]
  keySlots: TextRange[]
  hardStrings: HardString[]
}

function merge(into: Collected, result: ScanResult): void {
  into.usages.push(...result.usages)
  into.keySlots.push(...result.keySlots ?? [])
  into.hardStrings.push(...result.hardStrings ?? [])
}

class TemplateScan {
  readonly out: Collected = { usages: [], keySlots: [], hardStrings: [] }

  constructor(readonly parse: Awaited<ReturnType<typeof loadParser>>, readonly calls: readonly CallSpec[]) {}

  expression(content: string, offset: number): void {
    if (!content.trim())
      return
    try {
      merge(this.out, scanSource(this.parse, content, { calls: this.calls, offset, filename: 'template.ts', expression: true, hardStrings: false }))
    }
    catch {
      // `v-for` and `v-slot` expressions are not plain JS; they hold no keys.
    }
  }

  /** `:keypath="cond ? 'a' : 'b'"`: the expression is read as the key argument of a translate call. */
  keyExpression(content: string, offset: number): void {
    const callee = '__x18nKey('
    try {
      const result = scanSource(this.parse, `${callee}${content})`, { calls: [{ callee: '__x18nKey' }], offset: offset - callee.length, filename: 'template.ts', hardStrings: false })
      // The call is synthetic: there is no call in the file to hide.
      merge(this.out, { ...result, usages: result.usages.map(({ expression: _, ...usage }) => usage) })
    }
    catch {}
  }

  /** `v-t="'key'"` and `v-t="{ path: 'key' }"`. */
  vt(dir: DirectiveNode): void {
    const exp = dir.exp
    if (!exp || !('content' in exp))
      return
    const offset = exp.loc.start.offset
    const literal = /^\s*(['"`])(.*)\1\s*$/.exec(exp.content) ?? /path\s*:\s*(['"`])(.*?)\1/.exec(exp.content)
    if (!literal)
      return
    const start = offset + exp.content.indexOf(literal[2]!, literal.index)
    const range = { start, end: start + literal[2]!.length }
    this.out.usages.push({ raw: literal[2]!, range, kind: 'call', dynamic: false })
    this.out.keySlots.push(range)
  }

  attribute(element: ElementNode, prop: AttributeNode | DirectiveNode): void {
    if (prop.type === ATTRIBUTE) {
      const value = prop.value
      if (!value)
        return
      const range = { start: value.loc.start.offset + 1, end: value.loc.end.offset - 1 }
      if (isKeyAttribute(element.tag, prop.name)) {
        this.out.usages.push({ raw: value.content, range, kind: 'call', dynamic: false })
        this.out.keySlots.push(range)
      }
      else if (!ignoredAttributes.has(prop.name) && !prop.name.startsWith('data-') && /\p{L}/u.test(value.content)) {
        this.out.hardStrings.push({ text: value.content, range: { start: prop.loc.start.offset, end: prop.loc.end.offset }, kind: 'vue-attribute', attribute: prop.name })
      }
      return
    }
    if (prop.name === 't') {
      this.vt(prop)
      return
    }
    const exp = prop.exp
    if (exp && 'content' in exp) {
      const isKeyPath = prop.name === 'bind' && prop.arg && 'content' in prop.arg && isKeyAttribute(element.tag, prop.arg.content)
      if (isKeyPath)
        this.keyExpression(exp.content, exp.loc.start.offset)
      else
        this.expression(exp.content, exp.loc.start.offset)
    }
  }

  node(node: RootNode | TemplateChildNode): void {
    if (node.type === INTERPOLATION && 'content' in node.content)
      this.expression(node.content.content, node.content.loc.start.offset)
    if (node.type === TEXT) {
      const text = node.content.trim()
      if (text && /\p{L}/u.test(text)) {
        const start = node.loc.start.offset + node.content.indexOf(text)
        this.out.hardStrings.push({ text, range: { start, end: start + text.length }, kind: 'vue-template-text' })
      }
    }
    if (node.type === ELEMENT) {
      for (const prop of node.props)
        this.attribute(node, prop)
    }
    if ('children' in node) {
      for (const child of node.children) {
        if (typeof child === 'object' && child.type !== SIMPLE_EXPRESSION)
          this.node(child)
      }
    }
  }
}

/** Vue SFCs: `<script>` through the `js` scanner, template expressions, `v-t`, `<i18n-t keypath>`. */
export function vue(): Plugin {
  const scanner: Scanner = {
    id: 'vue',
    extensions: ['vue'],
    async scan(file, ctx) {
      const [{ parse }, parseJs] = await Promise.all([loadVueCompiler(), loadParser()])
      const { descriptor } = parse(file.text, { filename: file.path, sourceMap: false, ignoreEmpty: false })
      const template = new TemplateScan(parseJs, ctx.calls)
      for (const script of [descriptor.script, descriptor.scriptSetup]) {
        if (!script)
          continue
        const lang = script.lang ?? 'js'
        merge(template.out, scanSource(parseJs, script.content, { calls: ctx.calls, ignoreCallees: ctx.config.extract.ignoreCallees, offset: script.loc.start.offset, filename: `script.${lang === 'tsx' || lang === 'jsx' ? lang : lang === 'ts' ? 'ts' : 'js'}` }))
      }
      if (descriptor.template?.ast)
        template.node(descriptor.template.ast)
      return template.out
    },
  }
  return { name: 'x18n:scanner-vue', scanners: [scanner] }
}

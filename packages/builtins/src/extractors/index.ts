// Rules and key generation adapted from i18n-ally (MIT), src/extraction/* and src/core/Extract.ts
import type { ExtractItem, ExtractTemplate, HardString, KeyString, Project, TextRange } from '@x18n/core'
import { createLineIndex, pathMatcher, X18nError } from '@x18n/core'

export type Score = 'must-include' | 'should-include' | 'none' | 'should-exclude' | 'must-exclude'

export interface ExtractionRule {
  readonly id: string
  readonly test: (text: string, kind: string) => Score
}

const textKinds = new Set(['jsx-text', 'vue-template-text', 'svelte-text', 'html-text'])

/** Built-in rules, applied in order. A `must-*` wins at once; otherwise the last `should-*` decides. */
export const rules: readonly ExtractionRule[] = [
  { id: 'letters', test: text => /\p{L}/u.test(text) ? 'none' : 'must-exclude' },
  { id: 'digits', test: text => /^[\d\s.,:%+-]+$/.test(text) ? 'must-exclude' : 'none' },
  { id: 'url', test: text => /^(?:[a-z][\w+.-]*:\/\/|mailto:|#|\/\/)/i.test(text.trim()) ? 'must-exclude' : 'none' },
  { id: 'path', test: text => /^(?:\.{0,2}\/|~\/|@\/)[\w./@-]*$/.test(text.trim()) || /^[\w-]+\.[a-z]{2,4}$/i.test(text.trim()) ? 'must-exclude' : 'none' },
  { id: 'translate-call', test: text => /\$?t\(['"`]/.test(text) || text.includes('{{') ? 'must-exclude' : 'none' },
  { id: 'markup', test: text => /^<[^>]+>$/.test(text.trim()) ? 'must-exclude' : 'none' },
  { id: 'non-ascii', test: text => /\P{ASCII}/u.test(text) && /\p{L}/u.test(text) ? 'must-include' : 'none' },
  { id: 'sentence', test: text => /\p{L}\s+\p{L}/u.test(text) ? 'should-include' : 'none' },
  { id: 'text-node', test: (text, kind) => textKinds.has(kind) || kind.endsWith('attribute') ? 'should-include' : 'none' },
  { id: 'single-word', test: (text, kind) => !textKinds.has(kind) && !kind.endsWith('attribute') && !/\s/.test(text.trim()) ? 'should-exclude' : 'none' },
  // `tag="p"`, `type="submit"`: attribute values that are one lowercase token are code, not text.
  { id: 'attribute-token', test: (text, kind) => kind.endsWith('attribute') && /^[a-z][\w-]*$/.test(text.trim()) ? 'must-exclude' : 'none' },
  { id: 'identifier', test: text => /^[a-z]+(?:[A-Z][a-z\d]*)+$/.test(text) || /^[A-Z\d]+(?:_[A-Z\d]+)+$/.test(text) || /^[a-z\d]+(?:[-_.:][a-z\d]+)+$/.test(text) ? 'should-exclude' : 'none' },
]

/** Folds rule scores the i18n-ally way (`shouldExtract`). */
export function shouldExtract(text: string, kind: string, list: readonly ExtractionRule[] = rules): boolean {
  let result: Score = 'none'
  for (const rule of list) {
    const score = rule.test(text, kind)
    if (score === 'must-include')
      return true
    if (score === 'must-exclude')
      return false
    if (score !== 'none')
      result = score
  }
  return result === 'should-include'
}

/** Words of a text for slugs: letters and digits only. */
function words(text: string): string[] {
  return text.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').split(/[^\p{L}\d]+/u).filter(Boolean)
}

export type KeyCase = 'camel' | 'snake' | 'kebab' | 'dot'

/** "Forgot password?" becomes `forgotPassword` (camel), `forgot_password`, `forgot-password` or `forgot.password`. */
export function slugify(text: string, keyCase: KeyCase = 'camel', maxLength = 40): string {
  const parts: string[] = []
  let length = 0
  for (const word of words(text).map(w => w.toLowerCase())) {
    if (length + word.length > maxLength && parts.length > 0)
      break
    parts.push(word)
    length += word.length + 1
  }
  if (parts.length === 0)
    return 'text'
  switch (keyCase) {
    case 'snake': return parts.join('_')
    case 'kebab': return parts.join('-')
    case 'dot': return parts.join('.')
    default: return parts.map((word, i) => i === 0 ? word : word[0]!.toUpperCase() + word.slice(1)).join('')
  }
}

/** Fallback templates per kind, used after config and preset templates. */
export const defaultTemplates: readonly ExtractTemplate[] = [
  { template: '{t(\'{key}\'{args})}', kinds: ['jsx-text'] },
  { template: '{attr}={t(\'{key}\'{args})}', kinds: ['jsx-attribute'] },
  { template: '{{ $t(\'{key}\'{args}) }}', kinds: ['vue-template-text', 'html-text'] },
  { template: ':{attr}="$t(\'{key}\'{args})"', kinds: ['vue-attribute'] },
  { template: '{$t(\'{key}\'{args})}', kinds: ['svelte-text'] },
  { template: '{attr}={$t(\'{key}\'{args})}', kinds: ['svelte-attribute'] },
  { template: 't(\'{key}\'{args})' },
]

export interface ExtractCandidate {
  readonly path: string
  /** 1-based line, for display. */
  readonly line: number
  readonly kind: string
  readonly text: string
  /** The text in the file at `range`, used to detect stale plans. */
  readonly original: string
  readonly range: TextRange
  readonly attribute: string | undefined
  readonly key: KeyString
  /** True when an existing key with the same source value is reused. */
  readonly reused: boolean
  /** The message to store: template arguments become placeholders. */
  readonly value: string
  readonly replacement: string
  readonly imports: readonly string[]
  /** Other templates that also apply, for surfaces that let users choose. */
  readonly alternatives: readonly string[]
}

export interface FindOptions {
  /** Only these files (globs). */
  readonly files?: readonly string[] | undefined
}

function prefixFor(template: string | undefined, path: string): string {
  if (!template)
    return ''
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/').at(-1)! : ''
  return template
    .replace('{fileName}', slugify(base))
    .replace('{dirName}', slugify(dir))
    .replace('{component}', base.replace(/(?:^|[-_])(\w)/g, (_, c: string) => c.toUpperCase()))
}

function randomKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface Planned {
  readonly key: KeyString
  readonly reused: boolean
}

class KeyAllocator {
  readonly byValue = new Map<string, KeyString>()
  readonly taken = new Map<KeyString, string>()

  constructor(readonly project: Project) {
    const options = project.config.extract
    for (const key of project.keys()) {
      const value = project.message(key, project.sourceLocale)?.value
      if (typeof value === 'string') {
        this.taken.set(key, value)
        if (options.reuseExisting !== false && !this.byValue.has(value))
          this.byValue.set(value, key)
      }
    }
  }

  allocate(value: string, path: string, slugText: string): Planned {
    const options = this.project.config.extract
    const reused = this.byValue.get(value)
    if (reused)
      return { key: reused, reused: this.taken.has(reused) }
    const strategy = options.keygen ?? 'slug'
    const prefix = prefixFor(options.keyPrefix, path)
    let base: string
    if (strategy === 'source')
      base = value
    else if (strategy === 'random')
      base = randomKey()
    else if (strategy === 'empty')
      base = ''
    else
      base = slugify(slugText, options.keyCase ?? 'camel', options.keyMaxLength ?? 40)
    const raw = prefix ? `${prefix}.${base}` : base
    let key = this.project.parseKey(raw)
    for (let i = 2; this.taken.has(key) && this.taken.get(key) !== value; i++)
      key = this.project.parseKey(`${raw}${i}`)
    this.taken.set(key, value)
    this.byValue.set(value, key)
    return { key, reused: false }
  }
}

function isIgnored(project: Project, hard: HardString & { path: string }, text: string): boolean {
  const options = project.config.extract
  const matches = (rule: string): boolean => {
    const regex = /^\/(.+)\/([a-z]*)$/.exec(rule)
    return regex ? new RegExp(regex[1]!, regex[2]).test(hard.text) : rule === hard.text
  }
  if (options.ignore?.some(matches))
    return true
  for (const [glob, list] of Object.entries(options.ignoreByFile ?? {})) {
    if (pathMatcher([glob])(hard.path) && list.some(matches))
      return true
  }
  if (hard.attribute && options.ignoreAttributes?.includes(hard.attribute))
    return true
  const index = createLineIndex(text)
  const line = index.position(hard.range.start).line
  return index.line(line).includes('x18n-ignore') || (line > 0 && index.line(line - 1).includes('x18n-ignore'))
}

/** Placeholder shape of the project's first placeholder syntax, `{name}` by default. */
function placeholderShape(project: Project): (name: string) => string {
  const example = project.placeholderSyntaxes.find(s => s.example?.includes('name'))?.example ?? '{name}'
  return name => example.replace('name', name)
}

function templatesFor(project: Project, kind: string, path: string): string[] {
  return [...project.extractTemplates, ...defaultTemplates]
    .filter(t => (!t.kinds || t.kinds.includes(kind)) && (!t.files || pathMatcher(t.files)(path)))
    .map(t => t.template)
}

function rawKeyFor(project: Project, key: KeyString): string {
  const ns = project.config.namespace.default
  return project.namespaced && ns && key.startsWith(`${ns}:`) ? key.slice(ns.length + 1) : key
}

/** Hard strings worth extracting, with proposed keys, values and replacements. */
export function findCandidates(project: Project, options: FindOptions = {}): ExtractCandidate[] {
  const inFiles = options.files?.length ? pathMatcher(options.files) : undefined
  const keys = new KeyAllocator(project)
  const shape = placeholderShape(project)
  const out: ExtractCandidate[] = []
  for (const hard of project.hardStrings()) {
    if (inFiles && !inFiles(hard.path))
      continue
    const text = project.text(hard.path)
    if (text === undefined || !shouldExtract(hard.text, hard.kind) || isIgnored(project, hard, text))
      continue
    const value = hard.kind === 'js-template'
      ? hard.text.replace(/\{(\d+)\}/g, (_, i: string) => shape(hard.args?.[Number(i)]?.name ?? `arg${i}`))
      : hard.text
    const { key, reused } = keys.allocate(value, hard.path, hard.text.replace(/\{\d+\}/g, ' '))
    const templates = templatesFor(project, hard.kind, hard.path)
    const chosen = templates[0]!
    const args = hard.args?.length ? `, { ${hard.args.map(a => a.name === a.expression ? a.name : `${a.name}: ${a.expression}`).join(', ')} }` : ''
    const template = project.extractTemplates.find(t => t.template === chosen)
    out.push({
      path: hard.path,
      line: createLineIndex(text).position(hard.range.start).line + 1,
      kind: hard.kind,
      text: hard.text,
      original: text.slice(hard.range.start, hard.range.end),
      range: hard.range,
      attribute: hard.attribute,
      key,
      reused,
      value,
      replacement: chosen.replace('{key}', rawKeyFor(project, key)).replace('{attr}', hard.attribute ?? '').replace('{args}', args),
      imports: template?.imports ?? [],
      alternatives: templates.slice(1),
    })
  }
  return out
}

export interface ExtractPlanFile {
  readonly x18n: 1
  readonly project: string
  readonly items: readonly ExtractCandidate[]
}

export function toPlanFile(project: Project, candidates: readonly ExtractCandidate[]): ExtractPlanFile {
  return { x18n: 1, project: project.name, items: candidates }
}

/** Turns plan items (maybe edited by a human or agent) into edit items, after checking the files did not change. */
export function extractItems(project: Project, items: readonly Pick<ExtractCandidate, 'path' | 'range' | 'original' | 'key' | 'value' | 'replacement' | 'imports'>[]): ExtractItem[] {
  return items.map((item) => {
    const text = project.text(item.path)
    if (text === undefined || text.slice(item.range.start, item.range.end) !== item.original)
      throw new X18nError('X18N4004', `${item.path} changed since the plan was made`)
    return { path: item.path, range: item.range, key: project.parseKey(item.key), value: item.value, replacement: item.replacement, imports: item.imports }
  })
}

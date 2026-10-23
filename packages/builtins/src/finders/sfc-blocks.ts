import type { Format, MessageTree, NodeRange, Plugin, ResourceBlock, ResourceCandidate } from '@x18n/core'
import { isMessageLeaf, pathId } from '@x18n/core'
import { json } from '../formats/json'
import { json5 } from '../formats/json5'
import { yaml } from '../formats/yaml'
import { loadVueCompiler } from '../scanners/shared/vue-compiler'

const formatOfLang: Readonly<Record<string, string>> = {
  json: 'json',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
}

/** A format for blocks that hold every locale (`{ "en": {...}, "de": {...} }`): each resource sees its locale's subtree. */
function localeRoot(base: Format): Format {
  return {
    id: `sfc-${base.id}`,
    extensions: [],
    parse(text, ctx) {
      const parsed = base.parse(text, ctx)
      const subtree = parsed.tree[ctx.locale]
      const tree: MessageTree = subtree && !isMessageLeaf(subtree)
        ? subtree
        : {}
      const ranges = new Map<string, NodeRange>()
      const prefix = `${pathId([ctx.locale])}\u0000`
      for (const [id, range] of parsed.ranges ?? []) {
        if (id.startsWith(prefix))
          ranges.set(id.slice(prefix.length), range)
      }
      return { tree, ranges }
    },
    edit: base.edit
      ? (text, ops, ctx) => base.edit!(text, ops.map(op => ({
          ...op,
          path: [ctx.locale, ...op.path],
        })), ctx)
      : undefined,
  }
}

/** Resolves `src` against the SFC's folder (builtins have no `node:path`); undefined above the project root. */
function resolveSrc(from: string, src: string): string | undefined {
  const parts = src.startsWith('/')
    ? []
    : from.split('/').slice(0, -1)
  for (const part of src.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined)
        return undefined
    }
    else if (part && part !== '.') {
      parts.push(part)
    }
  }
  return parts.join('/')
}

/** The file and lang of a `src` block, if one of the block formats can read it; a `.js` or `.ts` file is not parsed as JSON. */
function srcFile(from: string, src: string, lang: string | undefined): { readonly path: string, readonly lang: string } | undefined {
  const path = resolveSrc(from, src)
  if (path === undefined)
    return undefined
  const fileLang = lang ?? path.slice(path.lastIndexOf('.') + 1)
  return Object.hasOwn(formatOfLang, fileLang)
    ? { path, lang: fileLang }
    : undefined
}

interface I18nBlock {
  /** The `.vue` file, or the file named by `src`. */
  readonly path: string
  readonly content: string
  /** The `locale` attribute. */
  readonly locale: string | undefined
  readonly block: ResourceBlock
  readonly src: boolean
}

/** One resource per locale of a block: its `locale` attribute, or every top-level key. */
function blockResources(bases: readonly Format[], i18n: I18nBlock, sourceLocale: string): ResourceCandidate[] {
  const { path, locale, block } = i18n
  const base = bases.find(f => f.id === (formatOfLang[block.lang ?? 'json'] ?? 'json'))!
  // A `locale` block from `src` is the whole file, a plain resource.
  if (locale) {
    return [
      {
        path,
        locale,
        namespace: undefined,
        format: base.id,
        block: i18n.src ? undefined : block,
      },
    ]
  }
  try {
    const locales = Object.keys(base.parse(i18n.content, {
      path,
      locale: '',
      namespace: undefined,
      indent: undefined,
    }).tree)
    return locales.map((locale, i) => ({
      path,
      locale,
      namespace: undefined,
      format: `sfc-${base.id}`,
      block: { ...block, index: block.index * 1000 + i },
    }))
  }
  catch {
    return [
      {
        path,
        locale: sourceLocale,
        namespace: undefined,
        format: `sfc-${base.id}`,
        block,
      },
    ]
  }
}

/**
 * Vue `<i18n>` blocks: one resource per block and locale (`locale="en"`, or every top-level locale key).
 * A block with `src` is a resource in the referenced file, so edits go there.
 */
export function sfcBlocks(): Plugin {
  const bases = [
    json(),
    json5(),
    yaml(),
  ].flatMap(plugin => plugin.formats ?? [])
  const blockFormats = bases.map(localeRoot)
  return {
    name: 'x18n:finder-sfc-blocks',
    formats: blockFormats,
    localeFinders: [
      {
        id: 'sfc-blocks',
        async find(ctx) {
          const files = await ctx.host.glob(['**/*.vue'], { ignore: ctx.config.usage.exclude, gitignore: true })
          const { parse } = await loadVueCompiler()
          const out: ResourceCandidate[] = []
          const sources = new Set<string>()
          for (const path of files) {
            const text = await ctx.host.readFile(path)
            if (!text?.includes('<i18n'))
              continue
            const { descriptor } = parse(text, { filename: path, sourceMap: false })
            for (const [index, { type, attrs, content, loc }] of descriptor.customBlocks.entries()) {
              if (type !== 'i18n')
                continue
              const lang = typeof attrs.lang === 'string'
                ? attrs.lang
                : undefined
              const locale = typeof attrs.locale === 'string'
                ? attrs.locale
                : undefined
              if (typeof attrs.src !== 'string') {
                out.push(...blockResources(bases, {
                  path,
                  content,
                  locale,
                  block: {
                    index,
                    range: { start: loc.start.offset, end: loc.end.offset },
                    lang: lang ?? 'json',
                  },
                  src: false,
                }, ctx.config.sourceLocale))
                continue
              }
              const src = srcFile(path, attrs.src, lang)
              const srcText = !src || sources.has(src.path)
                ? undefined
                : await ctx.host.readFile(src.path)
              if (!src || srcText === undefined)
                continue
              sources.add(src.path)
              // Locales of a `src` file share it, so each is a block that spans the whole file.
              const block = {
                index,
                range: { start: 0, end: srcText.length },
                lang: src.lang,
              }
              out.push(...blockResources(bases, {
                path: src.path,
                content: srcText,
                locale,
                block,
                src: true,
              }, ctx.config.sourceLocale))
            }
          }
          return out
        },
      },
    ],
  }
}

/** fluent-vue `<fluent locale="en">` blocks in Vue SFCs, read with the `ftl` format. */
export function sfcFluentBlocks(): Plugin {
  return {
    name: 'x18n:finder-sfc-fluent-blocks',
    localeFinders: [
      {
        id: 'sfc-fluent-blocks',
        async find(ctx) {
          const files = await ctx.host.glob(['**/*.vue'], { ignore: ctx.config.usage.exclude, gitignore: true })
          const { parse } = await loadVueCompiler()
          const out: ResourceCandidate[] = []
          for (const path of files) {
            const text = await ctx.host.readFile(path)
            if (!text?.includes('<fluent'))
              continue
            parse(text, { filename: path, sourceMap: false }).descriptor.customBlocks.forEach((block, index) => {
              if (block.type === 'fluent' && typeof block.attrs.locale === 'string') {
                const range = { start: block.loc.start.offset, end: block.loc.end.offset }
                out.push({
                  path,
                  locale: block.attrs.locale,
                  namespace: undefined,
                  format: 'ftl',
                  block: { index, range, lang: 'ftl' },
                })
              }
            })
          }
          return out
        },
      },
    ],
  }
}

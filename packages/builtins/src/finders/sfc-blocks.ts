import type { Format, MessageTree, NodeRange, Plugin, ResourceCandidate } from '@x18n/core'
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

/** Vue `<i18n>` blocks: one resource per block and locale (`locale="en"`, or every top-level locale key). */
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
          for (const path of files) {
            const text = await ctx.host.readFile(path)
            if (!text?.includes('<i18n'))
              continue
            const { descriptor } = parse(text, { filename: path, sourceMap: false })
            descriptor.customBlocks.forEach((block, index) => {
              if (block.type !== 'i18n')
                return
              const lang = typeof block.attrs.lang === 'string'
                ? block.attrs.lang
                : 'json'
              const formatId = formatOfLang[lang] ?? 'json'
              const range = { start: block.loc.start.offset, end: block.loc.end.offset }
              const blockInfo = { index, range, lang }
              if (typeof block.attrs.locale === 'string') {
                out.push({
                  path,
                  locale: block.attrs.locale,
                  namespace: undefined,
                  format: formatId,
                  block: blockInfo,
                })
                return
              }
              const base = bases.find(f => f.id === formatId)!
              try {
                const tree = base.parse(block.content, {
                  path,
                  locale: '',
                  namespace: undefined,
                  indent: undefined,
                }).tree
                for (const locale of Object.keys(tree)) {
                  out.push({
                    path,
                    locale,
                    namespace: undefined,
                    format: `sfc-${formatId}`,
                    block: { ...blockInfo, index: index * 1000 + Object.keys(tree).indexOf(locale) },
                  })
                }
              }
              catch {
                out.push({
                  path,
                  locale: ctx.config.sourceLocale,
                  namespace: undefined,
                  format: `sfc-${formatId}`,
                  block: blockInfo,
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

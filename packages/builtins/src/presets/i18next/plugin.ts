import type { ConfigContext, Plugin } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { doubleBraces, nesting } from '../../placeholders'

/** `defaultNS` and `fallbackNS` from the i18next init code (`i18n.ts`, `next-i18next.config.js`), as keys without a namespace use them. */
async function findNamespaces(host: ConfigContext['host']): Promise<{ default: string | undefined, fallback: string[] | undefined }> {
  const files = await host.glob(['**/*i18n*.{js,mjs,cjs,ts,mts,cts}', '**/i18n/index.{js,ts}'], {
    ignore: ['**/node_modules/**', '**/dist/**'],
    gitignore: true,
  })
  const found: { default: string | undefined, fallback: string[] | undefined } = { default: undefined, fallback: undefined }
  for (const file of files.slice(0, 20)) {
    const text = await host.readFile(file) ?? ''
    found.default ??= /\bdefaultNS\s*:\s*['"`]([^'"`]+)['"`]/.exec(text)?.[1]
    const fallback = /\bfallbackNS\s*:\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/.exec(text)?.[1]
    found.fallback ??= fallback
      ? [
          ...fallback.matchAll(/['"`]([^'"`]+)['"`]/g),
        ].map(m => m[1]!)
      : undefined
  }
  return found
}

export const i18nextPlugin: Plugin = createLibraryPlugin({
  name: 'x18n:i18next',
  // i18next names a namespace in a folder by its path: `useTranslation('pages/home')`.
  namespace: { separator: ':', default: 'translation', fromPath: 'slash' },
  extra: async (draft, ctx) => {
    const user = ctx.user.namespace
    if (user?.default && user.fallback)
      return
    const found = await findNamespaces(ctx.host)
    draft.namespace = {
      ...draft.namespace,
      default: user?.default ?? found.default ?? draft.namespace.default,
      fallback: user?.fallback ?? found.fallback ?? draft.namespace.fallback,
    }
  },
  calls: [
    {
      callee: ['t', 'i18next.t', 'i18n.t'],
      namespace: { arg: 1, property: 'ns' },
    },
    {
      callee: ['getFixedT', 'i18next.getFixedT', 'i18n.getFixedT'],
      factory: true,
      returns: ['t'],
      namespace: { arg: 1 },
      keyPrefix: { arg: 2 },
    },
    {
      callee: 'tr',
      types: ['TFunction'],
    },
  ],
  // Plural forms first, so each locale needs its own categories; `*` covers contexts and the v3 `_plural`.
  placeholders: [doubleBraces, nesting],
  derivedKeys: ['{key}_ordinal_{ordinal}', '{key}_{plural}', '{key}_*'],
  translatePrompt: (draft, ctx) => {
    draft.notes.push(`i18next plural keys end in _${ctx.localeInfo.pluralCategories.join(', _')} for ${ctx.targetLocale}; write one key per category.`)
  },
  templates: [
    {
      template: 'i18next.t(\'{key}\'{args})',
      kinds: ['js-string', 'js-template'],
      imports: ['import i18next from \'i18next\''],
    },
  ],
})

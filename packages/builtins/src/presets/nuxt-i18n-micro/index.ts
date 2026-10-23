import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { braces } from '../../placeholders'
import { readNuxtConfig } from '../nuxt-i18n/shared'

/** Nuxt's route name of a page component, which names its translation folder: `pages/products/[id].vue` is `products-id`. Route groups like `(admin)` are not part of it. */
function routeName(path: string): string | undefined {
  const segments = /^(?:app\/)?pages\/(.+)\.vue$/.exec(path)?.[1]?.split('/').filter(segment => !/^\(.+\)$/.test(segment))
  if (!segments?.length)
    return undefined
  if (segments.length > 1 && segments.at(-1) === 'index')
    segments.pop()
  return segments.join('-').replace(/[[\].]/g, '')
}

export function nuxtI18nMicro(): Preset {
  const returns = ['$t', '$ts', '$tc', '$has']
  return {
    name: 'nuxt-i18n-micro',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:nuxt-i18n-micro',
        // `$tn` and `$td` take format names, not message keys.
        calls: [
          { callee: returns },
          {
            callee: ['useI18n', 'useNuxtApp'],
            factory: true,
            returns,
          },
        ],
        templates: [
          {
            template: '{{ $t(\'{key}\'{args}) }}',
            kinds: ['vue-template-text'],
          },
          {
            template: ':{attr}="$t(\'{key}\'{args})"',
            kinds: ['vue-attribute'],
          },
          {
            template: '$t(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
            files: ['**/*.vue'],
            imports: ['import { useI18n } from \'#imports\'', 'const { $t } = useI18n()'],
          },
        ],
        extra: async (draft, ctx) => {
          const nuxtConfig = await readNuxtConfig(ctx.host)
          const dir = (nuxtConfig && /translationDir:\s*['"]([^'"]+)['"]/.exec(nuxtConfig)?.[1]?.replace(/^\.\/|\/$/g, '')) || 'locales'
          // Page files `pages/{route}/{locale}.json` read as keys under `pages.{route}`.
          draft.resources = [
            ...draft.resources,
            { pattern: `${dir}/{locale}.json` },
            { pattern: `${dir}/{namespaces}/{locale}.json` },
          ]
        },
        placeholders: [
          {
            ...braces,
            implicit: ['count'],
          },
        ],
      }),
      {
        name: 'x18n:nuxt-i18n-micro-pages',
        scanners: [
          {
            id: 'nuxt-i18n-micro-pages',
            extensions: ['vue'],
            // A page sees its own messages over the global ones.
            scan(file) {
              const route = routeName(file.path)
              return {
                usages: [],
                scopes: route
                  ? [
                      {
                        range: { start: 0, end: file.text.length },
                        keyPrefix: `pages.${route}`,
                        optionalPrefix: true,
                      },
                    ]
                  : [],
              }
            },
          },
        ],
      },
    ],
  }
}

export default nuxtI18nMicro

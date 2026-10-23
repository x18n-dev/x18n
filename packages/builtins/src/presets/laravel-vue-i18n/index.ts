import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { colon } from '../../placeholders'
import { laravelKey, laravelResources } from '../laravel/shared'

/** laravel-vue-i18n: the Laravel translation files read from Vue, so keys match the `laravel` preset. */
export function laravelVueI18n(): Preset {
  return {
    name: 'laravel-vue-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:laravel-vue-i18n',
        calls: [
          {
            callee: [
              'trans',
              'wTrans',
              'transChoice',
              'wTransChoice',
              'trans_choice',
              '$t',
              '$tChoice',
            ],
          },
        ],
        resources: laravelResources,
        normalizeKey: laravelKey,
        extra: async (draft, ctx) => {
          // Extraction writes to `lang/{locale}.json`, keyed by whole sentences in Laravel.
          draft.extract = { keygen: 'source', ...draft.extract }
          // While `vite dev` runs, the Vite plugin writes `lang/php_{locale}.json` from the PHP files of each locale.
          const phpFiles = await ctx.host.glob(['lang/*/**/*.php', 'resources/lang/*/**/*.php'], { gitignore: false })
          const locales = new Set(phpFiles.map((path) => {
            const segments = path.split('/')
            return segments[segments.indexOf('lang') + 1]
          }))
          draft.ignoreLocales = [
            ...draft.ignoreLocales,
            ...[...locales].map(locale => `php_${locale}`),
          ]
        },
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
            template: 'trans(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
            imports: ['import { trans } from \'laravel-vue-i18n\''],
          },
        ],
        placeholders: [colon],
      }),
    ],
  }
}

export default laravelVueI18n

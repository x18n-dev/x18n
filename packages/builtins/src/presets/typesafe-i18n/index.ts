import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { typedBraces } from '../../placeholders'
import { scriptExtensions } from '../shared'

/** Usage regex and resource layout after lokalise/i18n-ally#681. */
export function typesafeI18n(): Preset {
  return {
    name: 'typesafe-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:typesafe-i18n',
        // Messages are functions on the `LL` proxy: `LL.hello({ name })`, `$LL.a.b()` in Svelte.
        regex: [
          {
            extensions: [...scriptExtensions, 'vue', 'svelte'],
            patterns: ['\\bLL\\.({key})\\('],
          },
        ],
        // Namespace folders merge into the key path: `LL.dashboard.title()`.
        resources: [
          { pattern: 'src/i18n/{locale}/index.{ext}' },
          { pattern: 'src/i18n/{locale}/{namespace}/index.{ext}' },
        ],
        keyStyle: 'nested',
        templates: [
          {
            template: '{$LL.{key}({args})}',
            kinds: ['svelte-text'],
          },
          {
            template: '{attr}={$LL.{key}({args})}',
            kinds: ['svelte-attribute'],
          },
          {
            template: '$LL.{key}({args})',
            kinds: ['js-string', 'js-template'],
            files: ['**/*.svelte'],
          },
          {
            template: '{{ LL.{key}({args}) }}',
            kinds: ['vue-template-text'],
          },
          {
            template: ':{attr}="LL.{key}({args})"',
            kinds: ['vue-attribute'],
          },
          {
            template: '{LL.{key}({args})}',
            kinds: ['jsx-text'],
          },
          {
            template: '{attr}={LL.{key}({args})}',
            kinds: ['jsx-attribute'],
          },
          {
            template: 'LL.{key}({args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [typedBraces],
      }),
    ],
  }
}

export default typesafeI18n

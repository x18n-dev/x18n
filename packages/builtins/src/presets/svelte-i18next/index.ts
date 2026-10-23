import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { i18nextPlugin } from '../i18next/plugin'

export function svelteI18next(): Preset {
  return {
    name: 'svelte-i18next',
    plugins: [
      i18nextPlugin,
      createLibraryPlugin({
        name: 'x18n:svelte-i18next',
        // `createI18nStore(i18next)` is a store, so components call `$i18n.t`.
        calls: [
          {
            callee: '$i18n.t',
            namespace: { arg: 1, property: 'ns' },
          },
        ],
        // No imports: components get the store from a module or `getContext`, so `$i18n` is assumed in scope.
        templates: [
          {
            template: '{$i18n.t(\'{key}\'{args})}',
            kinds: ['svelte-text'],
          },
          {
            template: '{attr}={$i18n.t(\'{key}\'{args})}',
            kinds: ['svelte-attribute'],
          },
        ],
      }),
    ],
  }
}

export default svelteI18next

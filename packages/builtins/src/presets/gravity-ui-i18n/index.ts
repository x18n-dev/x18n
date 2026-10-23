import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { doubleBraces } from '../../placeholders'

/** @gravity-ui/i18n keysets as key prefixes. Adapted from the i18n-ally (MIT) gravity-i18n framework of lokalise/i18n-ally#1124. */
export function gravityUiI18n(): Preset {
  return {
    name: 'gravity-ui-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:gravity-ui-i18n',
        // A keyset prefixes its keys, so `i18n.i18n('page.home', 'title')` reads `page.home.title` both from
        // `page.home/en.json` and from one `en.json` that holds every keyset.
        calls: [
          {
            callee: ['i18n.i18n', 'i18nInstance.i18n'],
            key: 1,
            keyPrefix: { arg: 0 },
          },
          {
            callee: ['i18n.keyset', 'i18nInstance.keyset'],
            factory: true,
            keyPrefix: { arg: 0 },
          },
          {
            callee: ['i18n.bind', 'i18nInstance.i18n.bind'],
            factory: true,
            keyPrefix: { arg: 1 },
          },
        ],
        derivedKeys: [
          'zero',
          'one',
          'two',
          'few',
          'many',
          'other',
        ].map(form => `{key}.${form}`),
        resources: [
          { pattern: 'src/i18n-keysets/{namespaces}/{locale}.json' },
          { pattern: 'src/**/{namespace}/i18n/{locale}.json' },
        ],
        placeholders: [doubleBraces],
      }),
    ],
  }
}

export default gravityUiI18n

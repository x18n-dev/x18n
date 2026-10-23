import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { braces, linked, positionalBraces } from '../../placeholders'
import { pluralForms } from '../shared/plural-forms'

/** `easy_localization`: `'key'.tr()`, `tr('key')`, `context.tr('key')`, plural and gender forms as nested keys. */
export function easyLocalization(): Preset {
  return {
    name: 'easy-localization',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:easy-localization',
        regex: [
          {
            extensions: ['dart'],
            patterns: [
              '[\'"]({key})[\'"]\\s*\\.(?:tr|plural)\\(',
              '(?<![\\w$])Text\\(\\s*[\'"]({key})[\'"]\\s*\\)\\s*\\.(?:tr|plural)\\(',
              // `.tr(` on anything but `context` is the string or widget extension, matched above.
              '(?<![\\w$.])(?:context\\.)?(?:tr|plural)\\(\\s*[\'"]({key})[\'"]',
            ],
          },
        ],
        derivedKeys: [...pluralForms, 'male', 'female'].map(form => `{key}.${form}`),
        resources: [
          { pattern: 'assets/translations/{locale}.{ext}' },
        ],
        keyStyle: 'nested',
        templates: [
          { template: '\'{key}\'.tr()' },
        ],
        placeholders: [positionalBraces, braces, linked],
      }),
    ],
  }
}

export default easyLocalization

import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { percentBraces } from '../../placeholders'

export function i18nJs(): Preset {
  return {
    name: 'i18n-js',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:i18n-js',
        calls: [
          {
            callee: ['I18n.t', 'i18n.t'],
          },
        ],
        templates: [
          {
            template: 'i18n.t(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [percentBraces],
      }),
    ],
  }
}

export default i18nJs

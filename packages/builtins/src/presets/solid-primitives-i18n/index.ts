import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { doubleBraces } from '../../placeholders'

export function solidPrimitivesI18n(): Preset {
  return {
    name: 'solid-primitives-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:solid-primitives-i18n',
        calls: [
          {
            callee: ['t', 'i18n.t'],
          },
        ],
        templates: [
          {
            template: '{t(\'{key}\'{args})}',
            kinds: ['jsx-text'],
          },
          {
            template: '{attr}={t(\'{key}\'{args})}',
            kinds: ['jsx-attribute'],
          },
          {
            template: 't(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [doubleBraces],
      }),
    ],
  }
}

export default solidPrimitivesI18n

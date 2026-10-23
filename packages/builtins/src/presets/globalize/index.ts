import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { icu } from '../../placeholders'

export function globalize(): Preset {
  return {
    name: 'globalize',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:globalize',
        calls: [
          {
            callee: [
              'Globalize.messageFormatter',
              'Globalize.formatMessage',
              'globalize.messageFormatter',
              'globalize.formatMessage',
            ],
          },
        ],
        // Globalize paths use `/` (`greetings/hello`).
        normalizeKey: raw => raw.includes('/')
          ? raw.replace(/\//g, '.')
          : undefined,
        templates: [
          {
            template: 'Globalize.formatMessage(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [icu],
      }),
    ],
  }
}

export default globalize

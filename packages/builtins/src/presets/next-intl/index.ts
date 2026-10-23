import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { icu } from '../../placeholders'

export function nextIntl(): Preset {
  return {
    name: 'next-intl',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:next-intl',
        calls: [
          {
            callee: ['useTranslations', 'getTranslations'],
            factory: true,
            returns: [
              't',
              't.rich',
              't.markup',
              't.raw',
              't.has',
            ],
            keyPrefix: { arg: 0 },
          },
          {
            callee: 'getTranslations',
            factory: true,
            returns: [
              't',
              't.rich',
              't.markup',
              't.raw',
              't.has',
            ],
            keyPrefix: { arg: 0, property: 'namespace' },
          },
        ],
        resources: [
          { pattern: 'messages/{locale}.json' },
          { pattern: 'src/messages/{locale}.json' },
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
        placeholders: [icu],
      }),
    ],
  }
}

export default nextIntl

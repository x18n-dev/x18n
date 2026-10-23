import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'
import { jsxTemplates } from '../shared/jsx-templates'

export function nextInternational(): Preset {
  return {
    name: 'next-international',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:next-international',
        calls: [
          {
            callee: ['useI18n', 'getI18n'],
            factory: true,
            returns: ['t'],
          },
          {
            callee: ['useScopedI18n', 'getScopedI18n'],
            factory: true,
            returns: ['t'],
            keyPrefix: { arg: 0 },
          },
        ],
        resources: [
          { pattern: 'locales/{locale}.{ext}' },
          { pattern: 'src/locales/{locale}.{ext}' },
        ],
        templates: jsxTemplates,
        placeholders: [braces],
      }),
    ],
  }
}

export default nextInternational

import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { doubleBraces } from '../../placeholders'
import { scriptExtensions } from '../shared'
import { jsxTemplates } from '../shared/jsx-templates'

export function nextTranslate(): Preset {
  return {
    name: 'next-translate',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:next-translate',
        namespace: { separator: ':', default: 'common' },
        calls: [
          {
            callee: 'useTranslation',
            factory: true,
            returns: ['t'],
            namespace: { arg: 0 },
          },
          {
            callee: 'getT',
            factory: true,
            returns: ['t'],
            namespace: { arg: 1 },
          },
          {
            callee: 'Trans',
            key: { arg: 0, property: 'i18nKey' },
            namespace: { arg: 0, property: 'ns' },
          },
          { callee: 't' },
        ],
        regex: [
          {
            extensions: scriptExtensions,
            patterns: ['[^\\w\\d]t`({key})`'],
          },
        ],
        resources: [
          { pattern: 'locales/{locale}/{namespace}.json' },
        ],
        keyStyle: 'nested',
        templates: jsxTemplates,
        placeholders: [doubleBraces],
      }),
    ],
  }
}

export default nextTranslate

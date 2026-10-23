// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { scriptExtensions } from '../shared'

export function i18nTag(): Preset {
  return {
    name: 'i18n-tag',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:i18n-tag',
        regex: [
          {
            extensions: [...scriptExtensions, 'vue'],
            patterns: ['i18n`({key})`'],
          },
        ],
        templates: [
          {
            template: 'i18n`{key}`',
            kinds: ['js-string', 'js-template'],
          },
        ],
      }),
    ],
  }
}

export default i18nTag

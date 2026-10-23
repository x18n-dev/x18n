// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'

export function jekyll(): Preset {
  return {
    name: 'jekyll',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:jekyll',
        regex: [
          {
            extensions: ['html', 'md', 'liquid'],
            patterns: ['\\{%\\s+t\\s+({key})\\s+%\\}'],
          },
        ],
        resources: [
          { pattern: '_i18n/{locale}.yml' },
        ],
        keyStyle: 'nested',
        templates: [
          { template: '{% t {key} %}' },
        ],
      }),
    ],
  }
}

export default jekyll

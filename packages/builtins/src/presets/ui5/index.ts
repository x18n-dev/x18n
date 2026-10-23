import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'
import { scriptExtensions } from '../shared'

export function ui5(): Preset {
  return {
    name: 'ui5',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:ui5',
        regex: [
          {
            extensions: ['xml', 'json', ...scriptExtensions],
            patterns: ['\\{i18n>({key})\\}'],
          },
          {
            extensions: scriptExtensions,
            patterns: ['getResourceBundle\\(\\)\\.getText\\(\\s*[\'"`]({key})[\'"`]'],
          },
        ],
        resources: [
          { pattern: 'webapp/i18n/i18n_{locale}.properties' },
          { pattern: 'webapp/i18n/i18n.properties' },
        ],
        keyStyle: 'flat',
        templates: [
          {
            template: '{i18n>{key}}',
            files: ['**/*.xml'],
          },
          {
            template: 'this.getResourceBundle().getText(\'{key}\')',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [braces],
      }),
    ],
  }
}

export default ui5

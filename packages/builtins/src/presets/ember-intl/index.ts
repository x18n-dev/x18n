import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { icu } from '../../placeholders'

export function emberIntl(): Preset {
  return {
    name: 'ember-intl',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:ember-intl',
        calls: [
          {
            callee: ['intl.t'],
          },
        ],
        regex: [
          {
            extensions: ['hbs', 'gjs', 'gts'],
            patterns: ['\\{\\{\\s*t\\s+[\'"`]({key})[\'"`]', '\\(\\s*t\\s+[\'"`]({key})[\'"`]'],
          },
        ],
        resources: [
          { pattern: 'translations/{locale}.{ext}' },
          { pattern: 'translations/{namespaces}/{locale}.{ext}' },
        ],
        templates: [
          {
            template: '{{t \'{key}\'}}',
            files: ['**/*.hbs'],
          },
          {
            template: 'this.intl.t(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [icu],
      }),
    ],
  }
}

export default emberIntl

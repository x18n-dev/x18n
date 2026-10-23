// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { percentBraces } from '../../placeholders'

export function polyglot(): Preset {
  return {
    name: 'polyglot',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:polyglot',
        calls: [
          {
            callee: ['polyglot.t', 'I18n.t'],
          },
        ],
        regex: [
          {
            extensions: ['rb'],
            patterns: ['(?:polyglot|I18n)\\.t\\(\\s*[\'"`]({key})[\'"`]'],
          },
        ],
        templates: [
          {
            template: 'polyglot.t(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [percentBraces],
      }),
    ],
  }
}

export default polyglot

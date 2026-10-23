import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { printf } from '../../placeholders'

/** Joomla: INI language files, `Text::_('KEY')`. */
export function phpJoomla(): Preset {
  return {
    name: 'php-joomla',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:php-joomla',
        regex: [
          {
            extensions: ['php'],
            patterns: ['J?Text::(?:_|[\\w]+)\\(\\s*[\'"]({key})[\'"]'],
          },
        ],
        resources: [
          { pattern: 'language/{locale}/*.ini' },
          { pattern: 'administrator/language/{locale}/*.ini' },
        ],
        keyStyle: 'flat',
        templates: [
          { template: 'Text::_(\'{key}\')' },
        ],
        placeholders: [printf],
      }),
    ],
  }
}

export default phpJoomla

import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { colon } from '../../placeholders'
import { laravelKey, laravelResources } from './shared'

/** Laravel: `lang/{locale}/{file}.php` arrays and `lang/{locale}.json`; keys are `file.key`. Exclusive like i18n-ally. */
export function laravel(): Preset {
  return {
    name: 'laravel',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:laravel',
        // JSON translation keys are whole sentences, so the key is anything inside the quotes.
        regex: [
          {
            extensions: ['php'],
            patterns: ['[^\\w\\d](?:__|trans|@lang|trans_choice|Lang::get|Lang::choice)\\(\\s*\'([^\']+)\'', '[^\\w\\d](?:__|trans|@lang|trans_choice|Lang::get|Lang::choice)\\(\\s*"([^"]+)"'],
          },
        ],
        resources: laravelResources,
        normalizeKey: laravelKey,
        templates: [
          { template: '__(\'{key}\')' },
        ],
        placeholders: [colon],
      }),
    ],
  }
}

export default laravel

import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { braces, doubleBraces } from '../../placeholders'
import { pluralForms } from '../shared/plural-forms'

/** `flutter_translate`: `translate('key')`, `translatePlural('key', n)` with plural forms as nested keys. */
export function flutterTranslate(): Preset {
  return {
    name: 'flutter-translate',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:flutter-translate',
        regex: [
          {
            extensions: ['dart'],
            patterns: ['(?<![\\w$.])translate(?:Plural)?\\(\\s*[\'"]({key})[\'"]'],
          },
        ],
        // flutter_translate 4 uses the Intl plural names; before 4.0 the forms were `0`, `1`, `2` and `else`.
        derivedKeys: [...pluralForms, '0', '1', '2', 'else'].map(form => `{key}.${form}`),
        resources: [
          { pattern: 'assets/i18n/{locale}.{ext}' },
        ],
        keyStyle: 'nested',
        templates: [
          { template: 'translate(\'{key}\')' },
        ],
        placeholders: [braces, doubleBraces],
      }),
      // `{{value}}` is the count in plural forms.
    ],
  }
}

export default flutterTranslate

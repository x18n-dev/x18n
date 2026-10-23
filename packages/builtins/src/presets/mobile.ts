// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/flutter.ts
import type { Preset } from '@x18n/core'
import { braces, doubleBraces, linked, placeholders, positionalBraces } from '../placeholders'
import { dependsOn, library } from './shared'

// Not `{plural}`: easy_localization ignores CLDR plural rules by default, and both libraries fall back to `other`.
const pluralForms = ['zero', 'one', 'two', 'few', 'many', 'other']

/** Flutter with `flutter_i18n`: JSON or YAML assets, `FlutterI18n.translate(context, 'key')`. */
export function flutter(): Preset {
  return {
    name: 'flutter',
    detect: dependsOn(['flutter_i18n']),
    plugins: [
      library({
        name: 'flutter',
        regex: [{
          extensions: ['dart'],
          patterns: [
            '[^\\w\\d]FlutterI18n\\.(?:plural|translate)\\(\\s*[\\w\\d.]+,\\s*[\'"`]({key})[\'"`]',
            '[^\\w\\d]I18n(?:Plural|Text)\\(\\s*[\'"`]({key})[\'"`]',
          ],
        }],
        resources: [{ pattern: 'assets/flutter_i18n/{locale}.{ext}' }, { pattern: 'assets/i18n/{locale}.{ext}' }],
        templates: [{ template: 'FlutterI18n.translate(context, \'{key}\')' }],
      }),
      placeholders(braces),
    ],
  }
}

/** `easy_localization`: `'key'.tr()`, `tr('key')`, `context.tr('key')`, plural and gender forms as nested keys. */
export function easyLocalization(): Preset {
  return {
    name: 'easy-localization',
    detect: dependsOn(['easy_localization']),
    plugins: [
      library({
        name: 'easy-localization',
        regex: [{
          extensions: ['dart'],
          patterns: [
            '[\'"]({key})[\'"]\\s*\\.(?:tr|plural)\\(',
            '(?<![\\w$])Text\\(\\s*[\'"]({key})[\'"]\\s*\\)\\s*\\.(?:tr|plural)\\(',
            // `.tr(` on anything but `context` is the string or widget extension, matched above.
            '(?<![\\w$.])(?:context\\.)?(?:tr|plural)\\(\\s*[\'"]({key})[\'"]',
          ],
        }],
        derivedKeys: [...pluralForms, 'male', 'female'].map(form => `{key}.${form}`),
        resources: [{ pattern: 'assets/translations/{locale}.{ext}' }],
        keyStyle: 'nested',
        templates: [{ template: '\'{key}\'.tr()' }],
      }),
      placeholders(positionalBraces, braces, linked),
    ],
  }
}

/** `flutter_translate`: `translate('key')`, `translatePlural('key', n)` with plural forms as nested keys. */
export function flutterTranslate(): Preset {
  return {
    name: 'flutter-translate',
    detect: dependsOn(['flutter_translate']),
    plugins: [
      library({
        name: 'flutter-translate',
        regex: [{ extensions: ['dart'], patterns: ['(?<![\\w$.])translate(?:Plural)?\\(\\s*[\'"]({key})[\'"]'] }],
        derivedKeys: pluralForms.map(form => `{key}.${form}`),
        resources: [{ pattern: 'assets/i18n/{locale}.{ext}' }],
        templates: [{ template: 'translate(\'{key}\')' }],
      }),
      // `{{value}}` is the count in plural forms.
      placeholders(braces, doubleBraces),
    ],
  }
}

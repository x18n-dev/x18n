import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'

/** Flutter with `flutter_i18n`: JSON or YAML assets, `FlutterI18n.translate(context, 'key')`. */
export function flutter(): Preset {
  return {
    name: 'flutter',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:flutter',
        regex: [
          {
            extensions: ['dart'],
            patterns: [
              '[^\\w\\d]FlutterI18n\\.(?:plural|translate)\\(\\s*[\\w\\d.]+,\\s*[\'"`]({key})[\'"`]',
              '[^\\w\\d]I18n(?:Plural|Text)\\(\\s*[\'"`]({key})[\'"`]',
            ],
          },
        ],
        resources: [
          { pattern: 'assets/flutter_i18n/{locale}.{ext}' },
          { pattern: 'assets/i18n/{locale}.{ext}' },
        ],
        templates: [
          { template: 'FlutterI18n.translate(context, \'{key}\')' },
        ],
        placeholders: [braces],
      }),
    ],
  }
}

export default flutter

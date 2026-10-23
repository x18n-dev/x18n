import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { percentBraces } from '../../placeholders'
import { localeRoot } from '../shared/locale-root'

/** i18nice and python-i18n, which it forked: `{namespace}.{locale}.yml` files that start with the locale, `i18n.t('namespace.key')`. */
export function i18nice(): Preset {
  return {
    name: 'i18nice',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:i18nice',
        regex: [
          {
            extensions: ['py'],
            patterns: ['(?<![\\w.])(?:i18n\\.)?t\\(\\s*[\'"]({key})[\'"]'],
          },
        ],
        // The default `filename_format` is `{namespace}.{locale}.{format}`; folders add namespaces too.
        resources: [
          { pattern: 'translations/{namespaces}.{locale}.{ext}' },
          { pattern: 'locales/{namespaces}.{locale}.{ext}' },
        ],
        // Plural forms are sub-keys of the key passed with `count`.
        derivedKeys: [
          '{key}.zero',
          '{key}.one',
          '{key}.few',
          '{key}.many',
        ],
        transformResource: localeRoot(ctx => /\.(?:ya?ml|json)$/.test(ctx.path) && ctx.path.slice(0, ctx.path.lastIndexOf('.')).endsWith(`.${ctx.locale}`)),
        templates: [
          { template: 'i18n.t(\'{key}\')' },
        ],
        placeholders: [percentBraces],
      }),
    ],
  }
}

export default i18nice

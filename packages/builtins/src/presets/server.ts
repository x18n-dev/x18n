// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/laravel.ts, php-joomla.ts, php-gettext.ts, ruby-rails.ts and jekyll.ts
import type { Preset } from '@x18n/core'
import { colon, percentBraces, placeholders, printf } from '../placeholders'
import { dependsOn, library, localeRoot } from './shared'

/** Laravel: `lang/{locale}/{file}.php` arrays and `lang/{locale}.json`; keys are `file.key`. Exclusive like i18n-ally. */
export function laravel(): Preset {
  return {
    name: 'laravel',
    detect: dependsOn(['laravel/framework']),
    exclusive: true,
    plugins: [
      library({
        name: 'laravel',
        // JSON translation keys are whole sentences, so the key is anything inside the quotes.
        regex: [{ extensions: ['php'], patterns: ['[^\\w\\d](?:__|trans|@lang|trans_choice|Lang::get|Lang::choice)\\(\\s*\'([^\']+)\'', '[^\\w\\d](?:__|trans|@lang|trans_choice|Lang::get|Lang::choice)\\(\\s*"([^"]+)"'] }],
        resources: [
          { pattern: 'lang/{locale}/{namespaces}.php' },
          { pattern: 'resources/lang/{locale}/{namespaces}.php' },
          { pattern: 'lang/{locale}.json' },
          { pattern: 'resources/lang/{locale}.json' },
        ],
        // Nested translation files are referenced as `dir/file.key`.
        normalizeKey: raw => raw.includes('/') ? raw.replace(/\//g, '.') : undefined,
        templates: [{ template: '__(\'{key}\')' }],
      }),
      placeholders(colon),
    ],
  }
}

/** Joomla: INI language files, `Text::_('KEY')`. */
export function phpJoomla(): Preset {
  return {
    name: 'php-joomla',
    detect: dependsOn(['joomla/application', 'joomla/cms']),
    plugins: [
      library({
        name: 'php-joomla',
        regex: [{ extensions: ['php'], patterns: ['J?Text::(?:_|[\\w]+)\\(\\s*[\'"]({key})[\'"]'] }],
        resources: [{ pattern: 'language/{locale}/*.ini' }, { pattern: 'administrator/language/{locale}/*.ini' }],
        keyStyle: 'flat',
        templates: [{ template: 'Text::_(\'{key}\')' }],
      }),
      placeholders(printf),
    ],
  }
}

/** PHP gettext with `.po` files. Exclusive and never detected, as in i18n-ally: list it in `presets`. */
export function phpGettext(): Preset {
  return {
    name: 'php-gettext',
    exclusive: true,
    plugins: [
      library({
        name: 'php-gettext',
        regex: [{ extensions: ['php'], patterns: ['[^\\w\\d](?:gettext|_|__)\\(\\s*[\'"`]({key})[\'"`]'] }],
        resources: [{ pattern: 'locale/{locale}/LC_MESSAGES/*.po' }, { pattern: 'locales/{locale}.po' }],
        extra: (draft) => {
          draft.extract = { keygen: 'source', ...draft.extract }
        },
        templates: [{ template: 'gettext(\'{key}\')' }],
      }),
      placeholders(printf),
    ],
  }
}

const viewSuffix = /(?:\.html)?\.(?:erb|haml|slim)$/

/** `t('.title')` in `app/views/users/index.html.erb` means `users.index.title`. */
export function railsLazyKey(raw: string, path: string): string | undefined {
  if (!raw.startsWith('.'))
    return undefined
  const match = /(?:^|\/)app\/views\/(.+)$/.exec(path)
  if (!match)
    return undefined
  const scope = match[1]!.replace(viewSuffix, '').split('/').map(segment => segment.replace(/^_/, '')).join('.')
  return `${scope}${raw}`
}

export function rubyRails(): Preset {
  return {
    name: 'ruby-rails',
    detect: dependsOn(['rails', 'rails-i18n', 'railties']),
    plugins: [
      library({
        name: 'ruby-rails',
        regex: [{
          extensions: ['rb', 'erb', 'haml', 'slim'],
          patterns: ['[^\\w\\d]t(?:\\(| )\\s*[\'"`]({key})[\'"`]', '[^\\w\\d]t\\(:({key})\\)', 'I18n\\.t\\(\\s*[\'"`]({key})[\'"`]'],
        }],
        resources: [
          { pattern: 'config/locales/{locale}.yml' },
          { pattern: 'config/locales/**/*.{locale}.yml' },
          { pattern: 'config/locales/{locale}/**/*.yml' },
        ],
        normalizeKey: (raw, ctx) => railsLazyKey(raw, ctx.path),
        transformResource: localeRoot(ctx => /\.ya?ml$/.test(ctx.path)),
        templates: [{ template: 't(\'{key}\')' }],
      }),
      placeholders(percentBraces),
    ],
  }
}

export function jekyll(): Preset {
  return {
    name: 'jekyll',
    detect: dependsOn(['jekyll-multiple-languages-plugin']),
    plugins: [library({
      name: 'jekyll',
      regex: [{ extensions: ['html', 'md', 'liquid'], patterns: ['\\{%\\s+t\\s+({key})\\s+%\\}'] }],
      resources: [{ pattern: '_i18n/{locale}.yml' }],
      keyStyle: 'nested',
      templates: [{ template: '{% t {key} %}' }],
    })],
  }
}

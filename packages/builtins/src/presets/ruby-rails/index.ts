import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { percentBraces } from '../../placeholders'
import { localeRoot } from '../shared/locale-root'

export function rubyRails(): Preset {
  return {
    name: 'ruby-rails',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:ruby-rails',
        regex: [
          {
            extensions: ['rb', 'erb', 'haml', 'slim'],
            patterns: ['[^\\w\\d]t(?:\\(| )\\s*[\'"`]({key})[\'"`]', '[^\\w\\d]t\\(:({key})\\)', 'I18n\\.t\\(\\s*[\'"`]({key})[\'"`]'],
          },
        ],
        resources: [
          { pattern: 'config/locales/{locale}.yml' },
          { pattern: 'config/locales/**/*.{locale}.yml' },
          { pattern: 'config/locales/{locale}/**/*.yml' },
        ],
        normalizeKey: (raw, ctx) => railsLazyKey(raw, ctx.path),
        transformResource: localeRoot(ctx => /\.ya?ml$/.test(ctx.path)),
        templates: [
          { template: 't(\'{key}\')' },
        ],
        placeholders: [percentBraces],
      }),
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

export default rubyRails

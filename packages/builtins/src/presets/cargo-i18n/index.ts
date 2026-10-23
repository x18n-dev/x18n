import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { fluent } from '../../placeholders'

/** cargo-i18n with the Fluent system: `i18n.toml`, `{assets_dir}/{locale}/{crate}.ftl` and the `fl!` macro of `i18n-embed-fl`. */
export function cargoI18n(): Preset {
  return {
    name: 'cargo-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:cargo-i18n',
        // `fl!(loader, "id", ...)`, and `fl!("id")` from the wrapper macro the i18n-embed-fl docs suggest.
        regex: [
          {
            extensions: ['rs'],
            patterns: ['\\bfl!\\(\\s*(?:[^,"]+,\\s*)?"({key})"'],
          },
        ],
        // `fl!(loader, "id", "attr")` reads an attribute, so a used message uses its attributes.
        derivedKeys: ['{key}.*'],
        extra: async (draft, ctx) => {
          const toml = await ctx.host.readFile('i18n.toml') ?? ''
          const fallback = /^\s*fallback_language\s*=\s*["']([^"']+)["']/m.exec(toml)?.[1]
          if (fallback)
            draft.sourceLocale = fallback
          const assetsDir = /^\s*assets_dir\s*=\s*["']([^"']+)["']/m.exec(toml)?.[1]?.replace(/^\.\/|\/$/g, '') ?? 'i18n'
          draft.resources = [
            ...draft.resources,
            { pattern: `${assetsDir}/{locale}/*.ftl` },
          ]
        },
        templates: [
          { template: 'fl!(LANGUAGE_LOADER, "{key}")' },
        ],
        placeholders: [fluent],
      }),
    ],
  }
}

export default cargoI18n

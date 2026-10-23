import type { LocaleFinder, Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { dotnet } from '../../placeholders'

/** .NET satellite assemblies: `X.<culture>.resx` translates `X.resx`, so `Views.Shared.Nav.resx` alone is a source file. */
const resxFinder: LocaleFinder = {
  id: 'dotnet-resx',
  async find(ctx) {
    const paths = new Set(await ctx.host.glob(['**/*.resx'], {
      ignore: ['**/node_modules/**', '**/bin/**', '**/obj/**'],
      gitignore: false,
    }))
    return [...paths].map((path) => {
      const satellite = /^(.+)\.([^./]+)\.resx$/.exec(path)
      const locale = satellite && paths.has(`${satellite[1]}.resx`)
        ? satellite[2]!
        : ctx.config.sourceLocale
      return { path, locale, namespace: undefined }
    })
  },
  resolveNew({ locale, model }, ctx) {
    if (model?.finder !== 'dotnet-resx')
      return undefined
    const suffix = model.path.endsWith(`.${model.locale}.resx`)
      ? `.${model.locale}.resx`
      : '.resx'
    const base = model.path.slice(0, -suffix.length)
    return locale === ctx.config.sourceLocale
      ? `${base}.resx`
      : `${base}.${locale}.resx`
  },
}

/** .NET `IStringLocalizer` and strongly typed resources over `.resx` files: `Strings.resx` holds the source locale, `Strings.de.resx` German. */
export function dotnetResx(): Preset {
  return {
    name: 'dotnet-resx',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:dotnet-resx',
        // Keys are often the source text (`Localizer["Hello world"]`), so anything inside the quotes.
        regex: [
          {
            extensions: ['cs', 'cshtml', 'razor'],
            patterns: [
              '\\b(?:\\w*[Ll]ocali[sz]er|L|Loc)\\[\\s*"([^"]+)"',
              '\\b\\w*[Ll]ocali[sz]er\\.Get(?:String|Html)\\(\\s*"([^"]+)"',
              // `Resources.Hello` on the generated designer class, not its own members or a `App.Resources` namespace.
              '(?<![\\w.])(?:Properties\\.)?Resources\\.(?!ResourceManager\\b|Culture\\b)([A-Za-z_]\\w*)\\b(?![.(<])',
            ],
          },
        ],
        finders: [resxFinder],
        keyStyle: 'flat',
        templates: [
          {
            template: '@Localizer["{key}"]',
            files: ['**/*.cshtml', '**/*.razor'],
          },
          {
            template: '_localizer["{key}"]',
            files: ['**/*.cs'],
          },
        ],
        placeholders: [dotnet],
      }),
    ],
  }
}

export default dotnetResx

import type { LocaleFinder, ResourceCandidate } from '@x18n/core'

const nlsFile = /^(?:(.*)\/)?package\.nls(?:\.([\w-]+))?\.json$/
const bundleFile = /^(?:(.*)\/)?bundle\.l10n(?:\.([\w-]+))?\.json$/

/** VS Code extension strings: `package.nls[.locale].json` and `l10n/bundle.l10n[.locale].json`. */
export const nlsFinder: LocaleFinder = {
  id: 'nls',
  async find(ctx) {
    const paths = await ctx.host.glob(['**/package.nls*.json', '**/bundle.l10n*.json'], {
      ignore: ['**/node_modules/**'],
      gitignore: true,
    })
    const out: ResourceCandidate[] = []
    for (const path of paths) {
      const nls = nlsFile.exec(path)
      const bundle = nls
        ? undefined
        : bundleFile.exec(path)
      const match = nls ?? bundle
      if (!match)
        continue
      out.push({
        path,
        locale: match[2] ?? ctx.config.sourceLocale,
        namespace: undefined,
        format: 'json',
      })
    }
    return out
  },
}

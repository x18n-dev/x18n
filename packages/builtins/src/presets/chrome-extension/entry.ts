import type { DetectContext, PresetEntry } from '@x18n/core'

/** A Chrome or WebExtension manifest that declares `default_locale`. */
async function hasDefaultLocale(ctx: DetectContext): Promise<boolean> {
  for (const path of ['manifest.json', 'src/manifest.json', 'public/manifest.json']) {
    if ((await ctx.host.readFile(path))?.includes('"default_locale"'))
      return true
  }
  return false
}

const entry: PresetEntry = {
  detect: hasDefaultLocale,
  load: () => import('./index'),
}

export default entry

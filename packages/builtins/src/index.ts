import type { Builtins, Plugin } from '@x18n/core'
// The maps are imported through the package entries, not bundled, so each entry keeps its own module.
import { formats } from '@x18n/builtins/formats'
import { presets } from '@x18n/builtins/presets'
import { reporters } from '@x18n/builtins/reporters'
import { scanners } from '@x18n/builtins/scanners'
import regex from '@x18n/builtins/scanners/regex'
import { recommended } from './checks'
import { pattern } from './finders'
import { manifests } from './manifests'
import { reviews } from './reviews'

/** Plugins that are always on, and the presets that `'auto'` detects. Formats, scanners and presets load on demand; `regex` and the reporters are always loaded. */
export async function createBuiltins(): Promise<Builtins> {
  const formatPlugins: Plugin[] = Object.entries(formats).map(([id, entry]) => ({
    name: `x18n:format-${id}`,
    lazyFormats: [
      { id, ...entry },
    ],
  }))
  const scannerPlugins: Plugin[] = Object.entries(scanners).map(([id, entry]) => ({
    name: `x18n:scanner-${id}`,
    lazyScanners: [
      { id, ...entry },
    ],
  }))
  const reporterList = await Promise.all(Object.values(reporters).map(async load => (await load()).default))
  const reporterPlugin: Plugin = { name: 'x18n:reporters', reporters: reporterList }
  return {
    plugins: [
      manifests(),
      ...formatPlugins,
      pattern(),
      ...scannerPlugins,
      regex(),
      recommended(),
      reviews(),
      reporterPlugin,
    ],
    presets,
  }
}

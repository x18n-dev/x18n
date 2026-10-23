import type { Builtins } from '@x18n/core'
import { recommended } from './checks'
import { pattern } from './finders'
import { ecmascript, ftl, ini, json, json5, jsonc, php, po, properties, resx, yaml } from './formats'
import { manifests } from './manifests'
import { presets } from './presets'
import { reporters } from './reporters'
import { js, regex, svelte, vue } from './scanners'

/** Plugins that are always on, and the presets that `'auto'` detects. */
export function createBuiltins(): Builtins {
  return {
    plugins: [manifests(), json(), jsonc(), json5(), yaml(), po(), properties(), resx(), ftl(), ini(), php(), ecmascript(), pattern(), js(), vue(), svelte(), regex(), recommended(), reporters()],
    presets,
  }
}

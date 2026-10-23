import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn([
    '@inlang/paraglide-js',
    '@inlang/paraglide-sveltekit',
    '@inlang/paraglide-next',
    '@inlang/paraglide-astro',
    '@inlang/paraglide-vite',
  ]),
  load: () => import('./index'),
}

export default entry

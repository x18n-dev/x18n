import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['svelte-i18n', 'sveltekit-i18n', '@sveltekit-i18n/base']),
  load: () => import('./index'),
}

export default entry

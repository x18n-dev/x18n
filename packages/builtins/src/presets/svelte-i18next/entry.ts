import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['svelte-i18next']),
  load: () => import('./index'),
}

export default entry

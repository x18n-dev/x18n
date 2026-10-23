import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['i18n-embed-fl', 'i18n-embed']),
  load: () => import('./index'),
}

export default entry

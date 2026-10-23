import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['globalize']),
  load: () => import('./index'),
}

export default entry

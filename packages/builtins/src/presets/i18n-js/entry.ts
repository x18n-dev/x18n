import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['i18n-js']),
  load: () => import('./index'),
}

export default entry

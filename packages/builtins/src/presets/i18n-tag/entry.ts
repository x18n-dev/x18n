import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['es2015-i18n-tag']),
  load: () => import('./index'),
}

export default entry

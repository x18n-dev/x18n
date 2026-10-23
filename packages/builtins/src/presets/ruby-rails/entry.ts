import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['rails', 'rails-i18n', 'railties']),
  load: () => import('./index'),
}

export default entry

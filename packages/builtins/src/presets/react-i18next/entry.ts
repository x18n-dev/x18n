import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['react-i18next', 'next-i18next']),
  load: () => import('./index'),
}

export default entry

import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['typesafe-i18n']),
  load: () => import('./index'),
}

export default entry

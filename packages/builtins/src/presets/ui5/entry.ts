import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['@ui5/cli']),
  load: () => import('./index'),
}

export default entry

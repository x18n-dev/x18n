import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['@lingui/core', '@lingui/react', '@lingui/macro']),
  load: () => import('./index'),
}

export default entry

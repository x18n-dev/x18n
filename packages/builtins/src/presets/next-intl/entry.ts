import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['next-intl', 'use-intl']),
  load: () => import('./index'),
}

export default entry

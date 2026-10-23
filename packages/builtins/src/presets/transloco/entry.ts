import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['@jsverse/transloco', '@ngneat/transloco']),
  load: () => import('./index'),
}

export default entry

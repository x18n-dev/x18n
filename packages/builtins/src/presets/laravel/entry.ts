import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['laravel/framework']),
  exclusive: true,
  load: () => import('./index'),
}

export default entry

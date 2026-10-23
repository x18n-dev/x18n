import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['jekyll-multiple-languages-plugin']),
  load: () => import('./index'),
}

export default entry

import type { PresetEntry } from '@x18n/core'

const entry: PresetEntry = {
  detect: () => true,
  load: () => import('./index'),
}

export default entry

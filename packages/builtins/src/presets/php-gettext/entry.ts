import type { PresetEntry } from '@x18n/core'

const entry: PresetEntry = {
  exclusive: true,
  load: () => import('./index'),
}

export default entry

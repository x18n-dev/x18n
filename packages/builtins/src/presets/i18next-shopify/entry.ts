import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['@shopify/i18next-shopify']),
  load: () => import('./index'),
}

export default entry

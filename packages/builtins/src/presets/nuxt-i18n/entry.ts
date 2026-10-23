import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn(['@nuxtjs/i18n', 'nuxt-i18n']),
  load: () => import('./index'),
}

export default entry

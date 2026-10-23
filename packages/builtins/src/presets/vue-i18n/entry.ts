import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn([
    'vue-i18n',
    'vuex-i18n',
    'petite-vue-i18n',
    'vue-i18n-bridge',
  ], ['@intlify/']),
  load: () => import('./index'),
}

export default entry

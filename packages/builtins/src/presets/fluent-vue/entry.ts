import type { PresetEntry } from '@x18n/core'
import { dependsOn } from '../shared'

const entry: PresetEntry = {
  detect: dependsOn([
    'fluent-vue',
    'fluent-vue-loader',
    'rollup-plugin-fluent-vue',
    'unplugin-fluent-vue',
  ]),
  load: () => import('./index'),
}

export default entry

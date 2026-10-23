import type { ScannerEntry } from '@x18n/core'

const entry: ScannerEntry = {
  extensions: ['vue'],
  load: () => import('./index'),
}

export default entry

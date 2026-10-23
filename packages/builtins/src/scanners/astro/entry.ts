import type { ScannerEntry } from '@x18n/core'

const entry: ScannerEntry = {
  extensions: ['astro'],
  load: () => import('./index'),
}

export default entry

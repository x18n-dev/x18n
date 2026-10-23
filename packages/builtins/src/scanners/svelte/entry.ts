import type { ScannerEntry } from '@x18n/core'

const entry: ScannerEntry = {
  extensions: ['svelte'],
  load: () => import('./index'),
}

export default entry

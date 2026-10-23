import type { ScannerEntry } from '@x18n/core'

const entry: ScannerEntry = {
  extensions: [
    'js',
    'jsx',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'mts',
    'cts',
  ],
  load: () => import('./index'),
}

export default entry

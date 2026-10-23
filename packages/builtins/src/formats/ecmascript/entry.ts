import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'],
  load: () => import('./index'),
}

export default entry

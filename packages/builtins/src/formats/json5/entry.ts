import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['json5'],
  load: () => import('./index'),
}

export default entry

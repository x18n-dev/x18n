import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['yml', 'yaml'],
  load: () => import('./index'),
}

export default entry

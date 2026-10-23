import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['po', 'pot'],
  load: () => import('./index'),
}

export default entry

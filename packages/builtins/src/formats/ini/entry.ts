import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['ini'],
  load: () => import('./index'),
}

export default entry

import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['php'],
  load: () => import('./index'),
}

export default entry

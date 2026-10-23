import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['resx'],
  load: () => import('./index'),
}

export default entry

import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['jsonc'],
  load: () => import('./index'),
}

export default entry

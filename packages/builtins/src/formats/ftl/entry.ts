import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['ftl'],
  load: () => import('./index'),
}

export default entry

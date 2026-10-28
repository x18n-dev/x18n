import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['arb'],
  load: () => import('./index'),
}

export default entry

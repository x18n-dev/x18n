import type { FormatEntry } from '@x18n/core'

const entry: FormatEntry = {
  extensions: ['xmb', 'xtb'],
  load: () => import('./index'),
}

export default entry

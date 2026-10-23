import type { DetectContext, PresetEntry } from '@x18n/core'

const entry: PresetEntry = {
  detect: (ctx: DetectContext): boolean => ctx.hasAnyDependency(['vscode', '@types/vscode']),
  load: () => import('./index'),
}

export default entry

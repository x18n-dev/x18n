import type { PresetEntry } from '@x18n/core'

const entry: PresetEntry = {
  detect: async ctx => ctx.hasDependency('@angular/localize') && /"i18n"\s*:/.test(await ctx.host.readFile('angular.json') ?? ''),
  load: () => import('./index'),
}

export default entry

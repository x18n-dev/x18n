import type { PresetEntry } from '@x18n/core'

const entry: PresetEntry = {
  detect: async ctx => await ctx.fileExists('**/*.{csproj,vbproj,fsproj}') && await ctx.fileExists('**/*.resx'),
  load: () => import('./index'),
}

export default entry

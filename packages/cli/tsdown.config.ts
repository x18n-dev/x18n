import { cp, rm } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

const skills = new URL('./skills/', import.meta.url)

export default defineConfig({
  entry: ['src/index.ts', 'src/presets.ts', 'src/cli.ts'],
  platform: 'node',
  dts: true,
  exports: {
    exclude: ['cli'],
  },
  publint: true,
  hooks: {
    // The skills live at the repo root (so `skills add antfu/x18n` finds them) and ship in this package.
    'build:done': async () => {
      await rm(skills, { recursive: true, force: true })
      await cp(new URL('../../skills/', import.meta.url), skills, { recursive: true })
    },
  },
})

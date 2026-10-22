import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/devframe.ts', 'src/vite.ts'],
  platform: 'node',
  dts: true,
  exports: true,
  publint: true,
})

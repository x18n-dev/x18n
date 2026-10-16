import { defineConfig } from '@x18n/core'

export default defineConfig({
  projects: ['apps/*'],
  sourceLocale: 'en',
  checks: { 'unused-key': 'error' },
})

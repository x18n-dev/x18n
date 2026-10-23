// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { Preset } from '@x18n/core'
import { vueI18n } from '../vue-i18n'

export function nuxtI18n(): Preset {
  return {
    name: 'nuxt-i18n',
    plugins: [
      ...vueI18n().plugins,
      {
        name: 'x18n:nuxt-i18n',
        async config(draft, ctx) {
          const nuxtConfig = await ctx.host.readFile('nuxt.config.ts') ?? await ctx.host.readFile('nuxt.config.js')
          const langDir = nuxtConfig
            ? /langDir:\s*['"]([^'"]+)['"]/.exec(nuxtConfig)?.[1]?.replace(/^\.\/|\/$/g, '')
            : undefined
          const dirs = langDir
            ? [`i18n/${langDir}`, langDir]
            : ['i18n/locales', 'locales', 'lang']
          draft.resources = [
            ...draft.resources,
            ...dirs.map(dir => ({ pattern: `${dir}/{locale}.{ext}` })),
          ]
        },
      },
    ],
  }
}

export default nuxtI18n

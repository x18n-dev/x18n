import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  /**
   * Develop against a local checkout of the layer:
   * COMARK_DOCS_LAYER=../../comark-docs pnpm docs
   */
  extends: [process.env.COMARK_DOCS_LAYER || 'comark-docs'],

  site: {
    url: 'https://x18n.antfu.dev',
    name: 'x18n',
  },

  llms: {
    domain: 'https://x18n.antfu.dev',
    title: 'x18n',
    description: 'Manage and view i18n files of any project, for humans and agents: a core engine, CLI, language server, VS Code extension and UI.',
  },

  devtools: { enabled: false },

  hooks: {
    // Markdown resolves components by name at runtime, so the ones it uses must be global.
    'components:extend': (components) => {
      for (const component of components) {
        if (['X18nDemo', 'X18nTerminal', 'X18nFrameworks'].includes(component.pascalName))
          component.global = true
      }
    },
  },

  nitro: {
    // `comark` is only a transitive dep (via the layer); Nitro can't resolve it
    // from here and externalizes it as an absolute pnpm store path that is
    // missing on Vercel, so bundle it instead.
    externals: {
      inline: ['comark'],
    },
  },

  app: {
    head: {
      link: [
        { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/logo.svg' },
      ],
    },
  },
})

import type { NuxtConfig } from 'nuxt/schema'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const strict = {
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
}

const source = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))

// Moves a magic-link code out of the fragment before the hash router reads it; `app/backend.ts` exchanges it.
const stashOtp = `{const p=new URLSearchParams(location.hash.slice(1)),c=p.get('devframe_otp');if(c){sessionStorage.setItem('x18n:otp',c);history.replaceState(null,'',location.pathname+location.search+'#'+(p.get('route')||'/'))}}`

// `nuxt dev` has no devframe server of its own; bridge one in so the SPA finds `__connection.json` and the RPC socket.
// A module, so it runs only under `nuxt dev`: tools that merely load this config (knip, typecheck) start no watchers.
const devBridge: NonNullable<NuxtConfig['modules']>[number] = async (_, nuxt) => {
  if (!nuxt.options.dev)
    return
  const [{ addVitePlugin }, { devframeViteBridge }, { loadWorkspace, stderrLogger }, { createJiti }] = await Promise.all([
    import('nuxt/kit'),
    import('@devframes/vite/single'),
    import('@x18n/node'),
    import('jiti'),
  ])
  // The devframe definition from source; Node cannot load its extensionless TS imports by itself.
  const { createX18nDevframe } = await createJiti(import.meta.url).import<typeof import('./src/node/index')>('./src/node/index.ts')
  const workspace = await loadWorkspace({
    cwd: process.cwd(),
    upward: true,
    cache: true,
    logger: stderrLogger,
  })
  workspace.projects.forEach(p => p.project.watch())
  const bridge = devframeViteBridge(createX18nDevframe(workspace.projects), { base: './' }) as Omit<Plugin, 'configureServer'> & { configureServer: (server: ViteDevServer) => Promise<void> }
  // Mounted at `/`, the bridge answers every other request with a 404; let those fall through to Nuxt.
  const routes = /^\/(?:__connection\.json|__ws|__sse|__mcp)(?:[/?]|$)/
  addVitePlugin({
    ...bridge,
    configureServer: server => bridge.configureServer(new Proxy(server, {
      get: (target, key) => key === 'middlewares'
        ? {
            use: (handler: Connect.NextHandleFunction) => target.middlewares.use((req, res, next) => routes.test(req.url ?? '')
              ? handler(req, res, next)
              : next()),
          }
        : Reflect.get(target, key),
    })),
  })
  nuxt.hook('close', () => workspace.projects.forEach(p => p.project.dispose()))
}

export default defineNuxtConfig({
  ssr: false,

  modules: ['@unocss/nuxt', devBridge],

  imports: {
    autoImport: false,
  },

  components: {
    dirs: [],
  },

  css: ['@unocss/reset/tailwind.css'],

  // The wire types in `src/node` name core types; resolve them from sources so typecheck needs no build.
  alias: {
    '@x18n/core': source('core/src/index.ts'),
    '@x18n/builtins/extractors': source('builtins/src/extractors/index.ts'),
  },

  nitro: {
    preset: 'static',
    output: {
      dir: './dist',
    },
    hooks: {
      // Nuxt renders `app.baseURL: './'` as `/`, so the HTML would load `/_nuxt/` from the origin root.
      // Relative URLs let a host mount the SPA under a path, like Vite DevTools at `/__x18n/`.
      'prerender:generate': (route) => {
        if (route.contents)
          route.contents = route.contents.replaceAll('"/_nuxt/', '"./_nuxt/').replace('app:{baseURL:"/"', 'app:{baseURL:"./"')
      },
    },
  },

  // Hash routes and a relative base: the SPA works under any mount path and on hosts without a fallback route.
  router: {
    options: {
      hashMode: true,
    },
  },

  app: {
    baseURL: './',
    head: {
      title: 'x18n',
      viewport: 'width=device-width,initial-scale=1',
      meta: [
        { name: 'description', content: 'View and maintain the i18n messages of your project: coverage, keys, usages, diagnostics and extraction.' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'icon', href: './logo.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: './apple-touch-icon.png' },
      ],
      script: [
        { innerHTML: stashOtp },
      ],
    },
  },

  vite: {
    base: './',
  },

  typescript: {
    strict: true,
    tsConfig: { compilerOptions: strict },
    nodeTsConfig: { compilerOptions: strict },
    sharedTsConfig: { compilerOptions: strict },
  },

  devtools: {
    enabled: false,
  },

  compatibilityDate: '2026-10-01',
})

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
async function devBridge(): Promise<Plugin[]> {
  if (process.env.NODE_ENV === 'production' || process.argv.some(arg => arg === 'build' || arg === 'generate' || arg === 'prepare' || arg === 'typecheck'))
    return []
  const [{ devframeViteBridge }, { loadWorkspace, stderrLogger }, { createX18nDevframe }] = await Promise.all([
    import('@devframes/vite/single'),
    import('@x18n/node'),
    import('./src/node/index'),
  ])
  const workspace = await loadWorkspace({ cwd: process.cwd(), upward: true, cache: true, logger: stderrLogger })
  workspace.projects.forEach(p => p.project.watch())
  const bridge = devframeViteBridge(createX18nDevframe(workspace.projects), { base: './' }) as Omit<Plugin, 'configureServer'> & { configureServer: (server: ViteDevServer) => Promise<void> }
  // Mounted at `/`, the bridge answers every other request with a 404; let those fall through to Nuxt.
  const routes = /^\/(?:__connection\.json|__ws|__sse|__mcp)(?:[/?]|$)/
  return [{
    ...bridge,
    configureServer: server => bridge.configureServer(new Proxy(server, {
      get: (target, key) => key === 'middlewares'
        ? { use: (handler: Connect.NextHandleFunction) => target.middlewares.use((req, res, next) => routes.test(req.url ?? '') ? handler(req, res, next) : next()) }
        : Reflect.get(target, key),
    })),
  }]
}

export default defineNuxtConfig({
  ssr: false,

  modules: ['@unocss/nuxt'],

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
      script: [{ innerHTML: stashOtp }],
    },
  },

  vite: {
    base: './',
    plugins: await devBridge(),
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

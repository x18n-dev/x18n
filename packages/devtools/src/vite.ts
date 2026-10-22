import type { PluginWithDevTools } from '@vitejs/devtools-kit'
import type { UiProject } from '@x18n/ui'
import type { X18nDevtoolsOptions } from './load'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { createX18nDevframe } from '@x18n/ui'
import { loadProjects, rpcOptions } from './load'

export type { X18nDevtoolsOptions } from './load'

/** A Vite plugin that adds the x18n panel to Vite DevTools, and to Nuxt DevTools, which runs on it. */
export function X18nDevtools(options: X18nDevtoolsOptions = {}): PluginWithDevTools {
  let projects: readonly UiProject[] = []
  const definition = createX18nDevframe(async ctx => projects = await loadProjects(ctx, options), rpcOptions)
  return {
    ...createPluginFromDevframe(definition, { name: 'x18n:devtools' }),
    // Vite runs it when the dev server closes, including on restarts, which set the panel up again.
    closeBundle() {
      projects.forEach(p => p.project.dispose())
      projects = []
    },
  }
}

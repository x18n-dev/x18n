import type { DevframeDefinition, DevframeNodeContext } from 'devframe'
import type { RpcOptions } from './rpc'
import type { UiProject, X18nState } from './types'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe'
import { description, homepage, name, version } from '../../package.json' with { type: 'json' }
import { registerAgentTools } from './agent'
import { registerRpc } from './rpc'

export type { RpcOptions as X18nDevframeOptions } from './rpc'
export type * from './types'

/** Loads the projects when a host sets the devframe up, for hosts that own the working directory. */
export type UiProjectLoader = (ctx: DevframeNodeContext) => Promise<readonly UiProject[]>

/** The x18n UI, RPC functions and MCP tools over loaded projects, as a devframe definition. */
export function createX18nDevframe(source: readonly UiProject[] | UiProjectLoader, options: RpcOptions = {}): DevframeDefinition {
  return defineDevframe({
    id: 'x18n',
    name: 'x18n',
    version,
    packageName: name,
    homepage,
    description,
    icon: 'ph:translate-duotone',
    importMetaUrl: import.meta.url,
    clientAssets: fileURLToPath(new URL('./public', import.meta.url)),
    async setup(ctx) {
      const projects = typeof source === 'function' ? await source(ctx) : source
      registerRpc(ctx, projects, options)
      // A static report is dumped once, so it waits for history; the live UI updates when history arrives.
      if (ctx.mode !== 'dev') {
        await Promise.all(projects.map(p => p.project.loadHistory()))
        return
      }
      registerAgentTools(ctx, projects)
      const state = await ctx.scope('x18n').rpc.sharedState('state', { initialValue: { revision: 0, changedKeys: [] } satisfies X18nState })
      for (const p of projects) {
        p.project.onChange((change) => {
          state.mutate((draft) => {
            draft.revision += 1
            // A history reload changes no message; keep the last edited keys.
            if (change.keys.length)
              draft.changedKeys = [...change.keys]
          })
        })
        void p.project.loadHistory({ watch: true })
      }
    },
  })
}

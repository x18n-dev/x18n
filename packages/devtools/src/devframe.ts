import type { DevframeDefinition } from 'devframe'
import type { X18nDevtoolsOptions } from './load'
import { createX18nDevframe as createUiDevframe } from '@x18n/ui'
import { loadProjects, rpcOptions } from './load'

export type { X18nDevtoolsOptions } from './load'

/** The x18n devframe for a hub (`initHub`, `viteDevframeHub`): loads the workspace from the hub's root when mounted. */
export function createX18nDevframe(options: X18nDevtoolsOptions = {}): DevframeDefinition {
  return createUiDevframe(ctx => loadProjects(ctx, options), rpcOptions)
}

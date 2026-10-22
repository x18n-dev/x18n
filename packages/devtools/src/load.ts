import type { UiProject, X18nDevframeOptions } from '@x18n/ui'
import type { DevframeNodeContext } from 'devframe'
import { join } from 'node:path'
import process from 'node:process'
import { loadWorkspace, stderrLogger } from '@x18n/node'
import { launchEditor } from 'devframe/utils/launch-editor'

export interface X18nDevtoolsOptions {
  /** Project root. Defaults to the host's root (the Vite root), from where x18n searches upward for a config. */
  readonly root?: string | undefined
  /** Config file, instead of searching for one. */
  readonly config?: string | undefined
}

export async function loadProjects(ctx: DevframeNodeContext, options: X18nDevtoolsOptions): Promise<readonly UiProject[]> {
  const { projects } = await loadWorkspace({
    cwd: options.root ?? ctx.cwd,
    configFile: options.config,
    upward: options.root === undefined,
    cache: true,
    logger: stderrLogger,
  })
  if (ctx.mode === 'dev')
    projects.forEach(p => p.project.watch())
  return projects
}

export const rpcOptions: X18nDevframeOptions = {
  // Without a configured editor, launch-editor detects a running one.
  openInEditor: async ({ project, path, line, column }) => launchEditor(
    `${join(project.root, path)}:${line}:${column}`,
    process.env.LAUNCH_EDITOR || process.env.VISUAL || process.env.EDITOR || undefined,
  ),
}

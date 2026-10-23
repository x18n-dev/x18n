import type { Project, UserConfig } from '@x18n/core'
import { createMemoryHost, createProject, resolveConfig } from '@x18n/core'
import { createBuiltins } from '../src'

export async function createTestProject(files: Record<string, string>, config: UserConfig = {}): Promise<{ project: Project, files: Map<string, string> }> {
  const host = createMemoryHost(files)
  const setup = await resolveConfig({ host, config, builtins: await createBuiltins() })
  const project = createProject({ host, setup })
  await project.ready
  return { project, files: host.files }
}

export function json(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

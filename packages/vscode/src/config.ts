import type { NestedScopedConfigs } from './generated/meta'
import { defineConfig } from 'reactive-vscode'
import { scopedConfigs } from './generated/meta'

/** Reactive `x18n.*` settings. */
export const config = defineConfig<NestedScopedConfigs>(scopedConfigs.scope)

/** `x18n.annotationInPlace`, falling back to a value set under its former name `x18n.inPlace`. */
export function annotationInPlace(): boolean {
  const current = config.inspect<boolean>('annotationInPlace')
  if (current?.globalValue !== undefined || current?.workspaceValue !== undefined || current?.workspaceFolderValue !== undefined)
    return config.annotationInPlace
  return config.get<boolean>('inPlace') ?? config.annotationInPlace
}

import type { Disposable } from 'vscode'
import type { X18nClient } from './model/client'
import { extensions } from 'vscode'

interface PositionRequest {
  readonly textDocument: { readonly uri: string }
  readonly position: { readonly line: number, readonly character: number }
}

/**
 * The assumed shape of TS 7's middleware API: an async transformer of TS's response per LSP method. The API is not
 * released yet, so every access is guarded and nothing happens when it is missing or shaped differently.
 */
type RegisterLspMiddleware = (method: string, transform: (params: unknown, result: unknown) => Promise<unknown>) => Disposable | undefined

function middlewareApi(exports: unknown): RegisterLspMiddleware | undefined {
  if (typeof exports !== 'object' || exports === null || !('registerLspMiddleware' in exports) || typeof exports.registerLspMiddleware !== 'function')
    return undefined
  const register = exports.registerLspMiddleware
  return (method, transform) => {
    const disposable: unknown = register.call(exports, method, transform)
    if (typeof disposable !== 'object' || disposable === null || !('dispose' in disposable))
      return undefined
    const { dispose } = disposable
    return typeof dispose === 'function'
      ? {
          dispose: () => void dispose.call(disposable),
        }
      : undefined
  }
}

function isPositionRequest(params: unknown): params is PositionRequest {
  return typeof params === 'object' && params !== null && 'textDocument' in params && 'position' in params
    && typeof params.textDocument === 'object' && params.textDocument !== null && 'uri' in params.textDocument && typeof params.textDocument.uri === 'string'
}

/** With TS 7 active, rename on a key goes to x18n: TS's prepareRename and rename results are dropped there. */
export function registerNativePreviewMiddleware(x18n: X18nClient): Disposable[] {
  const extension = extensions.getExtension('TypeScriptTeam.native-preview')
  const register = extension?.isActive
    ? middlewareApi(extension.exports)
    : undefined
  if (!register)
    return []
  const onKey = async (params: unknown): Promise<boolean> => isPositionRequest(params)
    && await x18n.request('x18n/keyAt', { uri: params.textDocument.uri, position: params.position }).then(r => r !== null, () => false)
  const transform = async (params: unknown, result: unknown): Promise<unknown> => await onKey(params)
    ? null
    : result
  try {
    return ['textDocument/prepareRename', 'textDocument/rename'].flatMap(method => register(method, transform) ?? [])
  }
  catch {
    return []
  }
}

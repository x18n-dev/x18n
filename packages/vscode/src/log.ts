import type { ProgressResult, ProjectInfo } from '@x18n/lsp'
import type { Event } from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { X18nClient } from './model/client'
import { useDisposable } from 'reactive-vscode'
import { State } from 'vscode-languageclient/node'
import { formatStatus, stamp } from './model/log'

export type Log = (message: string) => void

/** Writes timestamped lines to the language client's output channel (`x18n: Show Output`). */
export function createLog(client: LanguageClient): Log {
  return message => client.outputChannel.appendLine(stamp(message))
}

/** Logs server state changes, and the project status after each (re)load and change. */
export function useLog(client: LanguageClient, x18n: X18nClient, refresh: Event<void>, log: Log): void {
  const names: Record<number, string> = { [State.Starting]: 'starting', [State.Running]: 'running', [State.Stopped]: 'stopped' }
  useDisposable(client.onDidChangeState(({ oldState, newState }) => {
    if (oldState !== newState)
      log(`Language server ${names[newState] ?? newState}.`)
  }))

  // Messages and files change often; only a different status is news.
  let last = ''
  async function logStatus(): Promise<void> {
    let projects: ProjectInfo[]
    let progress: ProgressResult
    try {
      [projects, progress] = await Promise.all([
        x18n.request('x18n/projects', undefined),
        x18n.request('x18n/progress', undefined),
      ])
    }
    catch {
      last = ''
      return
    }
    const lines = formatStatus(projects, progress)
    const signature = lines.join('\n')
    if (signature === last)
      return
    last = signature
    lines.forEach(log)
  }
  useDisposable(refresh(() => void logStatus()))
}

import type { ProjectInfo } from '@x18n/lsp'
import type { Uri } from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'
import type { KeyRef, X18nClient } from './model/client'
import { commands as serverCommands } from '@x18n/lsp'
import { useCommand } from 'reactive-vscode'
import { ConfigurationTarget, env, Range, Selection, TextEditorRevealType, commands as vscodeCommands, window, workspace } from 'vscode'
import { CodeActionKind, CodeActionRequest, ExecuteCommandRequest } from 'vscode-languageclient/node'
import { annotationInPlace, config } from './config'
import { flagIcon } from './flags'
import { commands } from './generated/meta'
import { migratableFolders, migrate } from './migrate'
import { isKeyRef, projectFor } from './model/client'
import { adjacentRange } from './model/locations'

interface CommandDeps {
  readonly client: LanguageClient
  readonly x18n: X18nClient
  readonly openUi: (ref?: Partial<KeyRef>) => Promise<void>
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Tree items carry their key under `item.ref`; hover links and callers pass a `KeyRef`. */
function refOf(arg: unknown): KeyRef | undefined {
  if (isKeyRef(arg))
    return arg
  if (typeof arg === 'object' && arg !== null && 'item' in arg && typeof arg.item === 'object' && arg.item !== null && 'ref' in arg.item && isKeyRef(arg.item.ref))
    return arg.item.ref
  return undefined
}

async function localeItem(locale: ProjectInfo['locales'][number]): Promise<{ label: string, code: string, iconPath?: Uri }> {
  const icon = await flagIcon(locale.code, locale.flag)
  return { label: locale.code, code: locale.code, ...icon ? { iconPath: icon } : {} }
}

/** Display locale, translate prompt and key commands. `x18n.extract` is the server's command, see `client.ts`. */
export function useCommands({ client, x18n, openUi }: CommandDeps): { extractAtCursor: () => Promise<void> } {
  const execute = (command: string, arg: object): Promise<unknown> => client.sendRequest(ExecuteCommandRequest.type, { command, arguments: [arg] })

  async function keyAtCursor(): Promise<KeyRef | undefined> {
    const editor = window.activeTextEditor
    if (!editor)
      return undefined
    const at = await x18n.request('x18n/keyAt', { uri: editor.document.uri.toString(), position: editor.selection.active })
    return at ? { project: at.project, key: at.key } : undefined
  }

  async function resolveRef(arg: unknown): Promise<KeyRef | undefined> {
    const ref = refOf(arg) ?? await keyAtCursor()
    if (!ref)
      void window.showWarningMessage('x18n: no key under the cursor.')
    return ref
  }

  async function project(name?: string): Promise<ProjectInfo | undefined> {
    const projects = await x18n.request('x18n/projects', undefined)
    const path = window.activeTextEditor?.document.uri.fsPath
    return projects.find(p => p.name === name) ?? (path === undefined ? undefined : projectFor(projects, path)) ?? projects[0]
  }

  async function pickLocale(info: ProjectInfo, placeHolder: string, skipSource = false): Promise<string | undefined> {
    const items = await Promise.all(info.locales.filter(l => !skipSource || l.code !== info.sourceLocale).map(async l => ({
      ...await localeItem(l),
      description: [l.displayName, l.code === info.sourceLocale ? 'source' : undefined].filter(Boolean).join(' · '),
    })))
    return (await window.showQuickPick(items, { placeHolder }))?.code
  }

  const register = (command: string, run: (...args: unknown[]) => Promise<unknown>): void => {
    useCommand(command, (...args: unknown[]) => run(...args).catch(error => window.showErrorMessage(`x18n: ${message(error)}`)))
  }

  register(commands.openUi, async () => openUi({ project: (await project())?.name }))
  register(commands.openKey, async (arg) => {
    const ref = await resolveRef(arg)
    if (ref)
      await openUi(ref)
  })

  register(commands.setDisplayLocale, async () => {
    const projects = await x18n.request('x18n/projects', undefined)
    const locales = [...new Map(projects.flatMap(p => p.locales).map(l => [l.code, l])).values()]
    const picked = await window.showQuickPick([
      { label: 'Source locale', description: projects.map(p => p.sourceLocale).join(', '), code: '' },
      ...await Promise.all(locales.map(async l => ({ ...await localeItem(l), description: l.displayName ?? '' }))),
    ], { placeHolder: 'Locale shown in annotations' })
    // The settings watcher in `index.ts` tells the server and refreshes the views.
    if (picked)
      await config.update('displayLocale', picked.code, workspace.workspaceFolders ? ConfigurationTarget.Workspace : ConfigurationTarget.Global)
  })

  register(commands.editKey, async (arg) => {
    const ref = await resolveRef(arg)
    const info = ref && await project(ref.project)
    if (!ref || !info)
      return
    const locale = await pickLocale(info, `Locale of ${ref.key} to edit`)
    const value = locale && await window.showInputBox({ title: `${ref.key} (${locale})`, prompt: 'New message' })
    if (value)
      await execute(serverCommands.set, { project: info.name, key: ref.key, locale, value })
  })

  register(commands.renameKeyPrefix, async (arg) => {
    const ref = await resolveRef(arg)
    const to = ref && await window.showInputBox({ title: `Rename ${ref.key}.*`, value: ref.key, valueSelection: [0, ref.key.length] })
    if (to && to !== ref.key)
      await execute(serverCommands.renamePrefix, { project: ref.project, key: ref.key, to })
  })

  register(commands.deleteKey, async (arg) => {
    const ref = await resolveRef(arg)
    const remove = 'Delete'
    if (ref && await window.showWarningMessage(`Delete ${ref.key} from every locale?`, { modal: true }, remove) === remove)
      await execute(serverCommands.delete, { project: ref.project, key: ref.key })
  })

  register(commands.extractFile, async () => {
    const uri = window.activeTextEditor?.document.uri.toString()
    if (uri && await execute(serverCommands.extract, { uri }) === null)
      void window.showInformationMessage('x18n: no hard strings in this file.')
  })

  async function translatePrompt(arg: unknown): Promise<{ locale: string, prompt: string } | undefined> {
    const ref = refOf(arg)
    const info = await project(ref?.project)
    const locale = info && await pickLocale(info, 'Translate into', true)
    if (!locale)
      return undefined
    return { locale, prompt: await x18n.request('x18n/translatePrompt', { project: info.name, locale, keys: ref ? [ref.key] : undefined }) }
  }

  register(commands.copyTranslatePrompt, async (arg) => {
    const found = await translatePrompt(arg)
    if (!found)
      return
    await env.clipboard.writeText(found.prompt)
    void window.showInformationMessage(`x18n: translate prompt for ${found.locale} copied.`)
  })

  // The editor's agent follows the prompt's own `x18n apply` and `x18n check` steps, so x18n calls no model itself (D39).
  register(commands.translateWithAgent, async (arg) => {
    const found = await translatePrompt(arg)
    if (!found)
      return
    if ((await vscodeCommands.getCommands(true)).includes('workbench.action.chat.open')) {
      await vscodeCommands.executeCommand('workbench.action.chat.open', { query: found.prompt, mode: 'agent' })
      return
    }
    await env.clipboard.writeText(found.prompt)
    void window.showInformationMessage(`x18n: this editor has no chat agent; translate prompt for ${found.locale} copied.`)
  })

  const goToUsage = (direction: 1 | -1) => async (): Promise<void> => {
    const editor = window.activeTextEditor
    if (!editor)
      return
    const { keys } = await x18n.request('x18n/fileKeys', { uri: editor.document.uri.toString() })
    const target = adjacentRange(keys.map(k => k.range), editor.selection.active, direction)
    if (!target)
      return
    const range = new Range(target.start.line, target.start.character, target.end.line, target.end.character)
    editor.selection = new Selection(range.start, range.end)
    editor.revealRange(range, TextEditorRevealType.InCenterIfOutsideViewport)
  }
  register(commands.goToNextUsage, goToUsage(1))
  register(commands.goToPrevUsage, goToUsage(-1))

  register(commands.toggleInPlace, async () => config.update('annotationInPlace', !annotationInPlace(), ConfigurationTarget.Global))
  register(commands.restartServer, () => client.restart())
  register(commands.showOutput, async () => client.outputChannel.show())

  register(commands.migrateFromI18nAlly, async () => {
    const folders = await migratableFolders()
    const folder = folders.length > 1
      ? (await window.showQuickPick(folders.map(f => ({ label: f.name, folder: f })), { placeHolder: 'Folder to migrate' }))?.folder
      : folders[0]
    if (!folder) {
      if (folders.length === 0)
        void window.showInformationMessage('x18n: no folder with i18n-ally settings and without an x18n config.')
      return
    }
    // The server loads projects once at start, so the new config needs a restart.
    if (await migrate(client, folder))
      await client.restart()
  })

  async function extractAtCursor(): Promise<void> {
    const editor = window.activeTextEditor
    if (!editor)
      return
    const { document, selection } = editor
    const actions = await client.sendRequest(CodeActionRequest.type, {
      textDocument: { uri: document.uri.toString() },
      range: client.code2ProtocolConverter.asRange(selection),
      context: { diagnostics: [], only: [CodeActionKind.RefactorExtract] },
    })
    const extracts = (actions ?? []).filter(a => 'kind' in a && a.kind === CodeActionKind.RefactorExtract && a.edit)
    const picked = extracts.length > 1 ? await window.showQuickPick(extracts.map(a => ({ label: a.title, action: a })), { placeHolder: 'Extract' }) : { action: extracts[0] }
    if (!picked?.action || !('edit' in picked.action) || !picked.action.edit) {
      if (extracts.length === 0)
        void window.showInformationMessage('x18n: no hard string to extract here.')
      return
    }
    await workspace.applyEdit(await client.protocol2CodeConverter.asWorkspaceEdit(picked.action.edit))
  }

  return { extractAtCursor }
}

/** Whether a `.vscode/settings.json` text (JSONC) sets any `i18n-ally.*`, `i18n-ally-next.*` or `vue-i18n-ally.*` key. */
export function hasI18nAllySettings(text: string): boolean {
  return /^\s*"(?:i18n-ally-next|i18n-ally|vue-i18n-ally)\.[^"]+"\s*:/m.test(text)
}

export interface MigrationResult {
  readonly files: readonly { readonly path: string, readonly content: string }[]
  readonly notes: readonly string[]
}

/** Validates the `x18n.migrateI18nAlly` command result at the boundary. */
export function parseMigrationResult(value: unknown): MigrationResult | undefined {
  if (typeof value !== 'object' || value === null || !('files' in value) || !Array.isArray(value.files))
    return undefined
  const files = value.files.flatMap((file: unknown) => typeof file === 'object' && file !== null
    && 'path' in file && typeof file.path === 'string' && 'content' in file && typeof file.content === 'string'
    ? [{ path: file.path, content: file.content }]
    : [])
  const notes = 'notes' in value && Array.isArray(value.notes) ? value.notes.filter((n: unknown) => typeof n === 'string') : []
  return { files, notes }
}

import type { GlobalOptions } from '../context'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { errors } from '@x18n/core'
import { findConfigFile, migrateI18nAlly } from '@x18n/node'
import { cwd, out, printJson } from '../context'

export interface MigrateCommandOptions extends GlobalOptions {
  readonly format?: 'ts' | 'yml' | 'json' | undefined
  readonly dryRun?: boolean | undefined
  readonly force?: boolean | undefined
}

export async function migrate(source: string, options: MigrateCommandOptions): Promise<void> {
  if (source !== 'i18n-ally')
    throw errors.X18N0001({ issue: `unknown migration source "${source}" (i18n-ally)` })
  const root = resolve(options.root ?? cwd())
  const result = await migrateI18nAlly(root, { format: options.format })
  const existing = findConfigFile(root)
  if (existing && !options.force && !options.dryRun && result.files.length > 0)
    throw errors.X18N0001({ issue: `${existing} already exists (pass --force to replace it)` })
  if (!options.dryRun) {
    for (const file of result.files) {
      const path = join(root, file.path)
      await mkdir(dirname(path), { recursive: true })
      if (file.path === '.x18n/reviews.yml' && existsSync(path))
        continue
      await writeFile(path, file.content)
    }
  }
  if (options.json) {
    printJson('migrate', { ...result, written: !options.dryRun })
    return
  }
  for (const file of result.files)
    out(options.dryRun ? `--- ${file.path}\n${file.content}` : `wrote ${file.path}`)
  for (const note of result.notes)
    out(`note: ${note}`)
  if (result.removable.length)
    out(`These i18n-ally settings can be removed now:\n${result.removable.map(key => `  ${key}`).join('\n')}`)
}

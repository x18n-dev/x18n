import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Entry of the `@x18n/lsp` installed in (or above) `folder`, if any. */
export function findLocalServer(folder: string): string | undefined {
  try {
    const manifest = createRequire(join(folder, 'package.json')).resolve('@x18n/lsp/package.json')
    const entry = join(dirname(manifest), 'bin.mjs')
    return existsSync(entry)
      ? entry
      : undefined
  }
  catch {
    return undefined
  }
}

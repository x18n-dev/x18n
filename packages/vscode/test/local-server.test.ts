import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { findLocalServer } from '../src/model/local-server'

it('finds an installed @x18n/lsp and ignores a project without one', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'x18n-local-')))
  expect(findLocalServer(root)).toBeUndefined()
  const pkg = join(root, 'node_modules', '@x18n', 'lsp')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({
    name: '@x18n/lsp',
    exports: { './package.json': './package.json' },
  }))
  expect(findLocalServer(root)).toBeUndefined()
  writeFileSync(join(pkg, 'bin.mjs'), '')
  expect(findLocalServer(root)).toBe(join(pkg, 'bin.mjs'))
})

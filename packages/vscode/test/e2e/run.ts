import { cp, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const temp = await mkdtemp(join(tmpdir(), 'x18n-vscode-e2e-'))
  const workspace = join(temp, 'workspace')

  await cp(fileURLToPath(new URL('../../../../test/fixtures/vue-i18n/', import.meta.url)), workspace, { recursive: true })
  // A key literal typed as a literal union, so tsserver accepts a rename there too.
  await writeFile(join(workspace, 'src/typed.ts'), `declare function t(key: 'app.title' | 'nav.home'): string\n\nexport const title = t('app.title')\n`)

  await runTests({
    // A full VS Code download; slow proxies stall the default 15 s idle timeout.
    timeout: 600_000,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'test/e2e/dist/suite.cjs'),
    launchArgs: [
      workspace,
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      `--user-data-dir=${join(temp, 'user')}`,
    ],
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

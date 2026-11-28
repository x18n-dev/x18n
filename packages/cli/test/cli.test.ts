import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { version } from '../package.json' with { type: 'json' }

// Git hooks set GIT_DIR and friends; they would point every git call here at the repo running the hook.
for (const name of Object.keys(process.env).filter(name => name.startsWith('GIT_')))
  delete process.env[name]

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))
const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url))
let work: string

interface Result { stdout: string, stderr: string, code: number }

function x18n(cwd: string, args: string[], input?: string): Promise<Result> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [bin, ...args, '--no-cache'], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
    }, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        code: error
          ? Number(error.code ?? 1)
          : 0,
      })
    })
    if (input !== undefined) {
      child.stdin!.write(input)
      child.stdin!.end()
    }
  })
}

function baselineCheck(dir: string, file: string, ...filters: string[]): (...args: string[]) => Promise<Result> {
  return (...args) => x18n(dir, [
    'check',
    '--baseline',
    file,
    '--json',
    ...filters,
    ...args,
  ])
}

async function fixture(name: string): Promise<string> {
  const dir = join(work, `${name}-${Math.random().toString(36).slice(2)}`)
  await cp(join(fixtures, name), dir, { recursive: true })
  await writeFile(join(dir, '.gitignore'), '')
  return dir
}

async function vueWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(work, 'baseline-projects-'))
  for (const name of ['web', 'docs'])
    await cp(join(fixtures, 'vue-i18n'), join(dir, 'apps', name), { recursive: true })
  return dir
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'x18n-cli-'))
})

afterAll(async () => {
  // Windows can keep a directory locked for a moment after the process using it exits.
  await rm(work, { recursive: true, force: true, maxRetries: 5 })
})

function json(result: Result): any {
  return JSON.parse(result.stdout)
}

// Every test spawns the binary, some spawn git too, and Windows runners are slow at both.
describe('x18n binary', { timeout: 30_000 }, () => {
  it('prints its version', async () => {
    const { stdout } = await x18n(work, ['--version'])
    expect(stdout).toContain(`x18n/${version}`)
  })

  it.each([
    {
      args: ['keys', '--bogus', '--json'],
      command: 'keys',
      message: 'Unknown option `--bogus`',
    },
    {
      args: ['--json', 'get'],
      command: 'get',
      message: 'missing required args for command `get <key>`',
    },
    {
      args: ['keys', '--limit', '--json'],
      command: 'keys',
      message: 'option `--limit <n>` value is missing',
    },
    {
      args: ['--bogus', '--json'],
      command: 'status',
      message: 'Unknown option `--bogus`',
    },
  ])('prints a JSON envelope for parser errors: $args', async ({ args, command, message }) => {
    const result = await x18n(work, args)
    expect(result.code).toBe(2)
    expect(result.stderr).toBe('')
    expect(json(result)).toEqual({
      x18n: 2,
      command,
      data: null,
      diagnostics: [],
      errors: [
        { name: 'CACError', why: message },
      ],
    })
  })

  it.each([
    ['keys', '--bogus'],
    ['keys', '--bogus', '--no-json'],
    ['keys', '--bogus', '--', '--json'],
  ])('keeps parser errors as text without JSON mode: %j', async (...args) => {
    const result = await x18n(work, args)
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('error: Unknown option `--bogus`\n')
  })

  it.each([
    [
      '--root',
      'get',
      'keys',
      '--limit=2',
      '--limit.foo=1',
      '--json',
    ],
    [
      '--no-json',
      '--json',
      'keys',
      '--limit=2',
      '--limit.foo=1',
    ],
    [
      '-no-x.y',
      'keys',
      '--json',
      '--no-limit=2',
      '--no-limit=2.foo',
    ],
    ['keys', '--==2', '--=.foo=1', '--json'],
  ])('prints the original error when parsing fails before command matching: %j', async (...args) => {
    const result = await x18n(work, args)
    expect(result.code).toBe(2)
    expect(result.stderr).toBe('')
    expect(json(result)).toMatchObject({
      command: 'keys',
      data: null,
      errors: [
        {
          name: 'TypeError',
          why: expect.stringContaining('foo'),
        },
      ],
    })
  })

  it.each([
    ['--json', '--no-json'],
    ['--', '--json'],
  ])('keeps early parser errors as text when JSON is disabled: %j', async (...flags) => {
    const result = await x18n(work, [
      'keys',
      '--limit=2',
      '--limit.foo=1',
      ...flags,
    ])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('foo')
  })

  it('check prints diagnostics with code frames and fails on errors', async () => {
    const dir = await fixture('vue-i18n')
    const result = await x18n(dir, ['check'])
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('src/locales/de.json:4:6\n ERROR  "app.greeting" in de has different placeholders than en: missing name.  placeholder-mismatch\n')
    expect(result.stdout).toMatch(/✖ \d+ errors?(?: {2}⚠ \d+ warnings?)? {2}\d+ files?\n$/)
  })

  it('check reports only the files it is given', async () => {
    const dir = await fixture('vue-i18n')
    const app = await x18n(dir, ['check', 'src/App.vue'])
    expect(app.code).toBe(1)
    expect(app.stdout).toContain('src/App.vue:17:15')
    expect(app.stdout).not.toContain('src/locales/')
    expect(app.stdout).toMatch(/✖ 1 error {2}1 file\n$/)

    const locales = await x18n(dir, ['check', 'src/locales/de.json'])
    expect(locales.stdout).toContain('src/locales/de.json')
    expect(locales.stdout).not.toContain('src/App.vue')

    // Tools such as lint-staged pass absolute paths, and files x18n does not read simply have no diagnostics.
    expect((await x18n(dir, [
      'check',
      join(dir, 'src/App.vue'),
    ])).stdout).toContain('src/App.vue:17:15')
    expect((await x18n(dir, ['check', 'package.json'])).stdout).toBe('Found no errors.\n')
  })

  it('check --json follows the contract', async () => {
    const dir = await fixture('i18next')
    const result = await x18n(dir, ['check', '--json'])
    const data = json(result)
    expect(data.x18n).toBe(2)
    expect(data.command).toBe('check')
    expect(data.diagnostics.find((d: any) => d.code === 'placeholder-mismatch')).toMatchObject({
      key: 'auth:login.submit',
      locale: 'de',
      file: 'public/locales/de/auth.json',
      range: { line: 4, column: 6 },
    })
  })

  it('check narrows with --only and fails on --max-warnings', async () => {
    const dir = await fixture('vue-i18n')
    expect((await x18n(dir, ['check', '--only', 'empty-translation'])).code).toBe(0)
    expect((await x18n(dir, [
      'check',
      '--only',
      'empty-translation',
      '--max-warnings',
      '0',
    ])).code).toBe(1)
    const github = await x18n(dir, [
      'check',
      '--only',
      'empty-translation',
      '--reporter',
      'github',
    ])
    expect(github.stdout).toContain('::warning file=src/locales/de.json,line=8,col=6')
  })

  it('check --locale matches the locales of a missing translation exactly', async () => {
    const dir = await fixture('vue-i18n')
    const full = JSON.stringify({
      header: { de: 'Header' },
      title: 'Title',
    })
    await writeFile(join(dir, 'src/locales/en.json'), full)
    await writeFile(join(dir, 'src/locales/de.json'), full)
    await writeFile(join(dir, 'src/locales/pt.json'), full)
    await writeFile(join(dir, 'src/locales/pt-BR.json'), '{}')
    const missing = async (locale: string): Promise<string[]> => json(await x18n(dir, [
      'check',
      '--only',
      'missing-translation',
      '--locale',
      locale,
      '--json',
    ])).diagnostics.map((d: any) => d.message).sort()
    expect(await missing('pt-BR')).toEqual([
      '"header.de" is missing in pt-BR.',
      '"title" is missing in pt-BR.',
    ])
    expect(await missing('pt')).toEqual([])
    expect(await missing('de')).toEqual([])
  })

  it('check --update-baseline writes a stable baseline that leaves out known diagnostics', async () => {
    const dir = await fixture('vue-i18n')
    const file = join(dir, '.x18n/check-baseline.json')
    const update = await x18n(dir, ['check', '--update-baseline'])
    expect(update.code).toBe(0)
    expect(update.stderr).toContain('Wrote 6 diagnostics to the baseline .x18n/check-baseline.json.')
    expect(update.stdout).toContain('Found no errors.\n\nThe baseline left out 6 known diagnostics.\n')
    const written = await readFile(file, 'utf8')
    const { diagnostics } = JSON.parse(written)
    expect(diagnostics[0]).toEqual({
      workspace: '..',
      project: { declaredIn: '.', directory: '.' },
      path: 'src/App.vue',
      code: 'missing-key',
      key: 'app.titel',
      locale: 'en',
      message: '"app.titel" is not defined in en.',
      count: 1,
    })
    expect(diagnostics.find((e: any) => e.code === 'unused-key')).not.toHaveProperty('locale')
    expect(diagnostics.map((e: any) => `${e.path} ${e.code} ${e.key}`)).toEqual(diagnostics.map((e: any) => `${e.path} ${e.code} ${e.key}`).sort())
    expect((await x18n(dir, ['check', '--update-baseline'])).code).toBe(0)
    expect(await readFile(file, 'utf8')).toBe(written)

    const known = json(await x18n(dir, ['check', '--json']))
    expect(known.diagnostics).toEqual([])
    expect(known.data.baseline).toEqual({ suppressed: 6, fixed: 0 })

    // A moved line stays known; one more identical diagnostic in the same file is new.
    const app = join(dir, 'src/App.vue')
    const source = await readFile(app, 'utf8')
    await writeFile(app, source.replace('<header>', '<header>\n    <p>moved</p>'))
    expect((await x18n(dir, ['check'])).code).toBe(0)
    await writeFile(app, source.replace(`<p>{{ title }}</p>`, `<p>{{ title }}</p>\n    <p>{{ $t('app.titel') }}</p>`))
    const duplicate = await x18n(dir, ['check', '--json'])
    expect(duplicate.code).toBe(1)
    expect(json(duplicate).diagnostics).toMatchObject([
      {
        code: 'missing-key',
        key: 'app.titel',
        file: 'src/App.vue',
        range: { line: 19 },
      },
    ])
    expect(json(duplicate).data.baseline).toEqual({ suppressed: 6, fixed: 0 })

    // Fixed diagnostics are counted, and --update-baseline drops them.
    await writeFile(app, source.replace(`<p>{{ $t('app.titel') }}</p>`, ''))
    const fixed = await x18n(dir, ['check'])
    expect(fixed.code).toBe(0)
    expect(fixed.stdout).toContain('The baseline left out 5 known diagnostics.\n\nFixed since the baseline: 1. Run `x18n check --update-baseline` to drop them from it.\n')
    await x18n(dir, [
      'check',
      '--update-baseline',
      '--skip',
      'unused-key',
    ])
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toHaveLength(5)
    expect(json(await x18n(dir, ['check', '--json'])).data.baseline).toEqual({ suppressed: 5, fixed: 0 })
  })

  it('check --baseline reads another file, and fails on a new diagnostic', async () => {
    const dir = await fixture('vue-i18n')
    await x18n(dir, [
      'check',
      '--update-baseline',
      '--baseline',
      'baseline.json',
      '--skip',
      'missing-key',
    ])
    const result = await x18n(dir, [
      'check',
      '--baseline',
      'baseline.json',
      '--json',
    ])
    expect(result.code).toBe(1)
    expect(json(result).diagnostics).toMatchObject([
      { code: 'missing-key' },
    ])
    // Without the file nothing is left out, and the JSON has no baseline.
    const all = json(await x18n(dir, ['check', '--json']))
    expect(all.diagnostics).toHaveLength(6)
    expect(all.data).not.toHaveProperty('baseline')
    await writeFile(join(dir, 'baseline.json'), '{')
    const invalid = await x18n(dir, ['check', '--baseline', 'baseline.json'])
    expect(invalid.code).toBe(2)
    expect(invalid.stderr).toContain('is not valid. Run `x18n check --update-baseline` to write it again.')
  })

  it('refuses an ambiguous project before fixing resources or refreshing a baseline', async () => {
    const dir = await vueWorkspace()
    await writeFile(join(dir, 'x18n.config.json'), '{"projects":["apps/*"]}')
    const apps = ['apps/docs', 'apps/web']
    for (const app of apps)
      await writeFile(join(dir, app, 'x18n.config.json'), '{"name":"portal"}')
    const file = join(dir, 'baseline.json')
    const original = '{"diagnostics":[]}\n'
    await writeFile(file, original)
    const check = (...args: string[]): Promise<Result> => x18n(dir, [
      'check',
      '--only',
      'missing-key',
      '--baseline',
      file,
      '--json',
      ...args,
    ])
    const resources = () => Promise.all(apps.map(app => readFile(join(dir, app, 'src/locales/en.json'), 'utf8')))
    const before = await resources()

    expect(json(await check()).diagnostics).toHaveLength(2)
    for (const flags of [
      [],
      ['--update-baseline'],
      ['--fix'],
    ]) {
      const result = await check('--project', 'portal', ...flags)
      expect(result.code).toBe(2)
      const reason = json(result).errors[0].why
      for (const name of ['portal', ...apps])
        expect(reason).toContain(name)
      expect(await readFile(file, 'utf8')).toBe(original)
      expect(await resources()).toEqual(before)
    }

    await writeFile(join(dir, 'apps/docs/x18n.config.json'), '{"name":"manual"}')
    expect((await check('--project', 'portal', '--update-baseline')).code).toBe(0)
    const remaining = await check()
    expect(remaining.code).toBe(1)
    expect(json(remaining).diagnostics).toMatchObject([
      { project: 'manual', code: 'missing-key' },
    ])
  })

  it('preserves excluded baseline rows from older readers and rejects incomplete owners', async () => {
    const dir = await fixture('vue-i18n')
    const file = join(dir, 'baseline.json')
    const check = (...args: string[]): Promise<Result> => x18n(dir, [
      'check',
      '--baseline',
      file,
      '--only',
      'missing-key',
      '--update-baseline',
      ...args,
    ])
    const legacy = {
      path: '.',
      code: 'unused-key',
      key: null,
      locale: null,
      message: 'Old diagnostic',
      count: 2,
      note: 'keep',
    }
    await writeFile(file, JSON.stringify({
      diagnostics: [legacy],
    }))
    expect((await check('--project', basename(dir))).code).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toContainEqual(legacy)

    const invalid = JSON.stringify({
      diagnostics: [
        {
          ...legacy,
          project: { directory: '.' },
        },
      ],
    })
    await writeFile(file, invalid)
    const result = await check('--project', basename(dir))
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('is not valid')
    expect(await readFile(file, 'utf8')).toBe(invalid)
  })

  it('treats a legacy null locale like an absent locale before scoped writes', async () => {
    const dir = await fixture('vue-i18n')
    const file = join(dir, 'baseline.json')
    const args = [
      'check',
      '--baseline',
      file,
      '--only',
      'unused-key',
      '--locale',
      'fr',
      '--json',
    ]
    expect((await x18n(dir, [...args, '--update-baseline'])).code).toBe(0)
    const { diagnostics } = JSON.parse(await readFile(file, 'utf8'))
    expect(diagnostics).toHaveLength(2)
    const legacy = JSON.stringify({
      diagnostics: diagnostics.map(({ project: _project, ...entry }: { project: unknown }) => ({ ...entry, locale: null })),
    })
    await writeFile(file, legacy)
    expect(json(await x18n(dir, args)).data.baseline).toEqual({ suppressed: 2, fixed: 0 })

    const resources = () => Promise.all(['en', 'de'].map(locale => readFile(join(dir, `src/locales/${locale}.json`), 'utf8')))
    const original = await resources()
    for (const flags of [
      [],
      ['--update-baseline'],
      ['--fix=unsafe'],
    ]) {
      const result = await x18n(dir, [
        ...args,
        '--project',
        basename(dir),
        ...flags,
      ])
      expect(result.code).toBe(2)
      expect(json(result).errors[0].why).toContain('does not identify the project')
      expect(await readFile(file, 'utf8')).toBe(legacy)
      expect(await resources()).toEqual(original)
    }
  })

  it('releases history watchers when a legacy baseline prevents watching', async () => {
    const dir = await fixture('vue-i18n')
    await writeFile(join(dir, 'watch-state'), 'idle')
    await writeFile(join(dir, 'history.mjs'), `import { writeFileSync } from 'node:fs'
export default () => ({
  name: 'test-history',
  histories: [{
    id: 'test',
    load: async () => undefined,
    watch() {
      writeFileSync('watch-state', 'active')
      return { dispose: () => writeFileSync('watch-state', 'idle') }
    },
  }],
})`)
    await writeFile(join(dir, 'x18n.config.json'), '{"name":"web","plugins":["./history.mjs"],"checks":{"stale-translation":"warning"}}')
    await writeFile(join(dir, 'baseline.json'), JSON.stringify({
      diagnostics: [
        {
          path: '.',
          code: 'unused-key',
          message: 'Legacy entry',
          count: 1,
        },
      ],
    }))
    const refused = await x18n(dir, [
      'check',
      '--watch',
      '--project',
      'web',
      '--baseline',
      'baseline.json',
      '--json',
    ])
    expect(refused.code).toBe(2)
    expect(json(refused).errors[0].why).toContain('does not identify the project')
    expect(await readFile(join(dir, 'watch-state'), 'utf8')).toBe('idle')
  })

  it('migrates the shared baseline before selecting one declaration', async () => {
    const dir = await mkdtemp(join(work, 'shared-declarations-'))
    for (const parent of ['a', 'b']) {
      await mkdir(join(dir, parent))
      await writeFile(join(dir, parent, 'x18n.config.json'), '{"root":"..","projects":["shared"]}')
    }
    await cp(join(fixtures, 'vue-i18n'), join(dir, 'shared'), { recursive: true })
    await writeFile(join(dir, 'shared/x18n.config.json'), '{"name":"web"}')
    const check = (...args: string[]): Promise<Result> => x18n(dir, ['check', '--json', ...args])
    const legacy = JSON.stringify({
      diagnostics: [
        {
          path: 'shared/src/App.vue',
          code: 'missing-key',
          key: 'app.titel',
          locale: 'en',
          message: '"app.titel" is not defined in en.',
          count: 2,
        },
      ],
    })
    const file = join(dir, '.x18n/check-baseline.json')
    await mkdir(join(dir, '.x18n'), { recursive: true })
    await writeFile(file, legacy)
    const selected = [
      '--project',
      'web',
      '--config',
      'a/x18n.config.json',
    ]
    const ambiguous = await check('--project', 'web')
    expect(ambiguous.code).toBe(2)
    expect(json(ambiguous).errors[0].why).toContain('migrate it in the original workspace before selecting a config')
    for (const refused of [
      await check(...selected, '--update-baseline'),
      await check('--root', 'a', '--project', 'web', '--update-baseline'),
      await x18n(join(dir, 'a'), [
        'check',
        '--project',
        'web',
        '--update-baseline',
        '--json',
      ]),
    ]) {
      expect(refused.code).toBe(2)
      expect(json(refused).errors[0].why).toContain('If this check loads only part of the original workspace')
      expect(await readFile(file, 'utf8')).toBe(legacy)
    }

    expect(json(await check()).data.baseline).toEqual({ suppressed: 2, fixed: 0 })
    expect((await check('--update-baseline')).code).toBe(0)
    expect((await check(...selected, '--update-baseline')).code).toBe(0)
    const workspace = await check('--only', 'missing-key')
    expect(workspace.code).toBe(0)
    expect(json(workspace).data.baseline).toEqual({ suppressed: 2, fixed: 0 })
  })

  it('finds the project name relative to the selected config', async () => {
    const dir = await mkdtemp(join(work, 'project-names-'))
    for (const parent of ['one', 'two']) {
      await mkdir(join(dir, 'nested', parent), { recursive: true })
      await writeFile(join(dir, 'nested', parent, 'x18n.config.json'), '{"root":"..","projects":["shared"]}')
    }
    await cp(join(fixtures, 'vue-i18n'), join(dir, 'nested/shared'), { recursive: true })
    const check = [
      'check',
      '--only',
      'missing-key',
      '--json',
      '--project',
    ]
    const ambiguous = await x18n(dir, [...check, 'nested/shared'])
    expect(ambiguous.code).toBe(2)
    expect(json(ambiguous).errors[0].why).toContain('x18n status --config <file>')
    const config = ['--config', 'nested/one/x18n.config.json']
    const status = await x18n(dir, ['status', ...config, '--json'])
    expect(status.code).toBe(0)
    const [project] = json(status).data.projects
    expect(project.name).toBe('shared')
    const selected = await x18n(dir, [
      ...check,
      project.name,
      ...config,
    ])
    expect(selected.code).toBe(1)
    expect(json(selected).diagnostics).toMatchObject([
      { project: 'shared', code: 'missing-key' },
    ])
  })

  it('reads and refreshes the same shared baseline through a nested config', async () => {
    const dir = await mkdtemp(join(work, 'nested-baseline-'))
    for (const declaration of ['one', 'nested/one', 'nested/two']) {
      await mkdir(join(dir, declaration), { recursive: true })
      await writeFile(join(dir, declaration, 'x18n.config.json'), '{"root":"..","projects":["shared"]}')
    }
    for (const project of ['shared', 'nested/shared'])
      await cp(join(fixtures, 'vue-i18n'), join(dir, project), { recursive: true })
    const baseline = join(dir, 'known.json')
    const check = baselineCheck(dir, baseline)
    const selected = [
      '--config',
      'nested/one/x18n.config.json',
      '--project',
      'shared',
    ]
    const en = 'nested/shared/src/locales/en.json'
    const resources = () => Promise.all([en, 'nested/shared/src/locales/de.json'].map(path => readFile(join(dir, path), 'utf8')))
    const before = await resources()
    const legacy = JSON.stringify({
      diagnostics: [
        {
          path: en,
          code: 'unused-key',
          key: 'unused',
          message: 'Old diagnostic',
          count: 2,
        },
      ],
    })
    await writeFile(baseline, legacy)
    for (const flags of [
      [],
      ['--update-baseline'],
      ['--fix=unsafe'],
    ]) {
      const refused = await check(en, ...selected, '--only', 'unused-key', ...flags)
      expect(refused.code).toBe(2)
      expect(await resources()).toEqual(before)
      expect(await readFile(baseline, 'utf8')).toBe(legacy)
    }

    expect((await check('--update-baseline')).code).toBe(0)
    const missing = ['--only', 'missing-key']
    const app = 'nested/shared/src/App.vue'
    const original = await readFile(baseline, 'utf8')
    expect(json(await check(...selected, app, ...missing)).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect((await check(...selected, app, ...missing, '--update-baseline')).code).toBe(0)
    expect(await readFile(baseline, 'utf8')).toBe(original)

    const source = await readFile(join(dir, app), 'utf8')
    await writeFile(join(dir, app), source.replace('app.titel', 'app.title'))
    expect((await check(...selected, app, ...missing, '--update-baseline')).code).toBe(0)
    const full = await check(...missing)
    expect(full.code).toBe(0)
    expect(json(full).data.baseline).toEqual({ suppressed: 1, fixed: 1 })
    const remaining = JSON.parse(await readFile(baseline, 'utf8')).diagnostics
    expect(remaining.filter((row: { code: string }) => row.code === 'missing-key').map((row: { project: { declaredIn: string } }) => row.project.declaredIn).sort()).toEqual(['nested/two', 'one'])
  })

  it.skipIf(process.platform === 'win32')('checks a POSIX filename containing a literal backslash', async () => {
    const dir = await fixture('vue-i18n')
    const file = 'src/A\\pp.vue'
    await rename(join(dir, 'src/App.vue'), join(dir, file))
    const baseline = join(dir, 'known.json')
    const check = baselineCheck(dir, baseline, '--only', 'missing-key')
    const fresh = await check(file)
    expect(fresh.code).toBe(1)
    expect(json(fresh).diagnostics).toMatchObject([
      { code: 'missing-key', key: 'app.titel' },
    ])
    expect((await check(file, '--update-baseline')).code).toBe(0)
    expect(json(await check(file)).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    // Baselines from before project ownership replaced literal backslashes with slashes.
    const legacy = {
      path: 'src/A/pp.vue',
      code: 'missing-key',
      key: 'app.titel',
      locale: 'en',
      message: '"app.titel" is not defined in en.',
      count: 1,
    }
    await writeFile(baseline, JSON.stringify({
      diagnostics: [legacy],
    }))
    expect(json(await check()).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect(json(await check(file)).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect((await check('--update-baseline')).code).toBe(0)
    expect(JSON.parse(await readFile(baseline, 'utf8')).diagnostics).toMatchObject([
      { path: file, count: 1 },
    ])
  })

  it.skipIf(process.platform === 'win32')('migrates a legacy filename shared by two POSIX spellings', async () => {
    const dir = await fixture('vue-i18n')
    const literal = 'src/A\\pp.vue'
    const nested = 'src/A/pp.vue'
    await mkdir(join(dir, 'src/A'))
    await rename(join(dir, 'src/App.vue'), join(dir, literal))
    await cp(join(dir, literal), join(dir, nested))
    const file = join(dir, 'known.json')
    const check = baselineCheck(dir, file, '--only', 'missing-key')
    const legacy = JSON.stringify({
      diagnostics: [
        {
          path: nested,
          code: 'missing-key',
          key: 'app.titel',
          locale: 'en',
          message: '"app.titel" is not defined in en.',
          count: 2,
        },
      ],
    })
    await writeFile(file, legacy)
    for (const path of [literal, nested]) {
      expect((await check(path, '--update-baseline')).code).toBe(2)
      expect(await readFile(file, 'utf8')).toBe(legacy)
    }
    expect(json(await check()).data.baseline).toEqual({ suppressed: 2, fixed: 0 })
    const source = join(dir, literal)
    await writeFile(source, (await readFile(source, 'utf8')).replace('app.titel', 'app.title'))
    expect((await check(nested, '--update-baseline')).code).toBe(2)
    expect(await readFile(file, 'utf8')).toBe(legacy)
    expect((await check('--update-baseline')).code).toBe(0)
    expect((await check(literal, '--update-baseline')).code).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toMatchObject([
      { path: nested, count: 1 },
    ])
  })

  it('uses the same baseline through a workspace directory alias', async () => {
    const dir = await mkdtemp(join(work, 'aliased-workspace-'))
    const parent = join(dir, 'parent')
    const actual = join(parent, 'outer/nested')
    await cp(join(fixtures, 'vue-i18n'), join(actual, 'shared'), { recursive: true })
    await writeFile(join(actual, 'x18n.config.json'), '{"projects":["shared"]}')
    await symlink(actual, join(parent, 'alias'), 'junction')
    await symlink(parent, join(dir, 'link'), 'junction')
    await mkdir(join(parent, 'outer/node_modules'))
    await symlink(actual, join(parent, 'outer/node_modules/pkg'), 'junction')
    const file = join(dir, 'known.json')
    const check = baselineCheck(dir, file, '--only', 'missing-key')
    for (const [root, alias] of [
      ['parent/outer/nested', 'parent/alias'],
      ['parent/outer', 'parent/alias'],
      ['parent/outer', 'link/alias'],
      ['link/outer', 'parent/alias'],
      ['parent/outer', 'parent/outer/node_modules/pkg'],
    ] as const) {
      await rm(file, { force: true })
      expect((await check('--root', root, '--update-baseline')).code).toBe(0)
      const before = await readFile(file, 'utf8')
      const selected = ['--root', alias, '--project', 'shared']
      expect(json(await check(...selected)).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
      expect((await check(...selected, '--update-baseline')).code).toBe(0)
      expect(await readFile(file, 'utf8')).toBe(before)
    }
  })

  it('refreshes the declaration named by a linked workspace package', async () => {
    const dir = await mkdtemp(join(work, 'linked-member-'))
    const actual = join(dir, 'packages/app')
    const member = join(dir, 'web')
    await cp(join(fixtures, 'vue-i18n'), actual, { recursive: true })
    await writeFile(join(actual, 'x18n.config.json'), '{"name":"web"}')
    await symlink(actual, member, 'junction')
    await mkdir(join(dir, 'node_modules'))
    await symlink(process.platform === 'win32'
      ? member
      : '../web', join(dir, 'node_modules/web'), 'junction')

    const file = join(dir, 'known.json')
    const check = baselineCheck(dir, file, '--only', 'missing-key')
    expect(json(await check('--update-baseline')).data.baseline).toEqual({ suppressed: 2, fixed: 0 })
    for (const [first, second] of [
      ['node_modules/web', 'packages/app'],
      ['web', 'packages/app'],
      ['packages/app', 'web'],
    ] as const) {
      const fresh = join(dir, 'member-first.json')
      await rm(fresh, { force: true })
      const memberFirst = baselineCheck(dir, fresh, '--only', 'missing-key')
      expect((await memberFirst('--root', first, '--project', 'web', '--update-baseline')).code).toBe(0)
      expect(json(await memberFirst()).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
      expect((await memberFirst('--root', second, '--project', 'web')).code).toBe(1)
      expect((await memberFirst('--root', second, '--project', 'web', '--update-baseline')).code).toBe(0)
      expect(json(await memberFirst()).data.baseline).toEqual({ suppressed: 2, fixed: 0 })
    }
    const app = join(actual, 'src/App.vue')
    await writeFile(app, (await readFile(app, 'utf8')).replace('app.titel', 'app.title'))
    expect((await check('--root', 'node_modules/web', '--project', 'web', '--update-baseline')).code).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toMatchObject([
      {
        project: { declaredIn: 'packages/app', directory: 'packages/app' },
      },
    ])
  })

  it('keeps a default baseline portable when created through a workspace alias', async () => {
    const dir = await mkdtemp(join(work, 'portable-baseline-'))
    const actual = join(dir, 'actual')
    await cp(join(fixtures, 'vue-i18n'), actual, { recursive: true })
    await symlink(actual, join(dir, 'alias'), 'junction')
    expect((await x18n(dir, [
      'check',
      '--root',
      'alias',
      '--update-baseline',
    ])).code).toBe(0)
    const file = '.x18n/check-baseline.json'
    const original = await readFile(join(actual, file), 'utf8')
    expect(JSON.parse(original).diagnostics[0].workspace).toBe('..')
    await rename(actual, join(dir, 'moved'))
    const check = await x18n(dir, ['check', '--root', 'moved', '--json'])
    expect(json(check).data.baseline).toEqual({ suppressed: 6, fixed: 0 })
  })

  it('keeps a declaring directory outside a symlinked config root', async () => {
    const dir = await mkdtemp(join(work, 'linked-root-'))
    const resources = join(dir, 'outside/resources')
    await cp(join(fixtures, 'vue-i18n'), join(resources, 'shared'), { recursive: true })
    await mkdir(join(dir, 'nested'))
    await symlink(resources, join(dir, 'nested/ref'), 'junction')
    const config = 'nested/x18n.config.json'
    await writeFile(join(dir, config), '{"root":"ref","projects":["shared"]}')
    const file = join(dir, 'known.json')
    const check = baselineCheck(dir, file, '--only', 'missing-key')
    expect((await check('--update-baseline')).code).toBe(0)
    const before = await readFile(file, 'utf8')
    const selected = [
      '--config',
      config,
      '--project',
      'shared',
    ]
    for (const files of [
      [],
      ['outside/resources/shared/src/App.vue'],
    ]) {
      expect(json(await check(...files, ...selected)).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
      expect((await check(...files, ...selected, '--update-baseline')).code).toBe(0)
      expect(await readFile(file, 'utf8')).toBe(before)
    }
    const removed = 'outside/resources/shared/src/App.vue'
    await rm(join(dir, removed))
    expect(json(await check(removed, ...selected)).data.baseline).toEqual({ suppressed: 0, fixed: 1 })
    expect((await check(removed, ...selected, '--update-baseline')).code).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('preserves the baseline if a filtered refresh cannot resolve a saved path', async () => {
    const dir = await fixture('vue-i18n')
    const file = join(dir, 'known.json')
    const check = baselineCheck(dir, file)
    expect((await check('--update-baseline')).code).toBe(0)
    const original = await readFile(file, 'utf8')
    const app = join(dir, 'src/App.vue')
    await rm(app)
    await symlink('App.vue', app)
    const failed = await check('src/locales/en.json', '--update-baseline')
    expect(failed.code).toBe(2)
    expect(await readFile(file, 'utf8')).toBe(original)
  })

  it('refuses legacy fixes when a directory alias changes the stored path', async () => {
    const dir = await mkdtemp(join(work, 'baseline-alias-'))
    const actual = join(dir, 'actual')
    await cp(join(fixtures, 'vue-i18n'), join(actual, 'shared'), { recursive: true })
    await symlink(actual, join(dir, 'alias'), 'junction')
    await writeFile(join(actual, 'members.json'), '{"projects":["shared"]}')
    const baseline = join(dir, 'known.json')
    const resource = 'shared/src/locales/en.json'
    const resources = () => Promise.all(['en', 'de'].map(locale => readFile(join(actual, 'shared/src/locales', `${locale}.json`), 'utf8')))
    const original = await resources()
    for (const workspace of [undefined, '.']) {
      const legacy = JSON.stringify({
        diagnostics: [
          {
            path: `alias/${resource}`,
            code: 'unused-key',
            message: 'Old diagnostic',
            count: 1,
            workspace,
          },
        ],
      })
      await writeFile(baseline, legacy)
      const refused = await x18n(dir, [
        'check',
        `actual/${resource}`,
        '--config',
        'actual/members.json',
        '--project',
        'shared',
        '--baseline',
        baseline,
        '--only',
        'unused-key',
        '--fix=unsafe',
        '--json',
      ])
      expect(refused.code).toBe(2)
      expect(await resources()).toEqual(original)
      expect(await readFile(baseline, 'utf8')).toBe(legacy)
    }
  })

  it('keeps diagnostics without a location in file-scoped project checks', async () => {
    const dir = await fixture('vue-i18n')
    await writeFile(join(dir, 'project-check.mjs'), `export default () => ({
  name: 'project-check',
  checks: [{ id: 'whole-project', defaultSeverity: 'error', run: () => [{ message: 'Project error' }] }],
})`)
    await writeFile(join(dir, 'x18n.config.json'), JSON.stringify({
      name: 'web',
      plugins: ['./project-check.mjs'],
    }))
    const check = (...args: string[]): Promise<Result> => x18n(dir, [
      'check',
      'src/App.vue',
      '--project',
      'web',
      '--only',
      'whole-project',
      '--json',
      ...args,
    ])
    expect((await check()).code).toBe(1)
    expect((await check('--update-baseline')).code).toBe(0)
    const file = join(dir, '.x18n/check-baseline.json')
    const before = await readFile(file, 'utf8')
    expect(json(await check('--update-baseline')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect(await readFile(file, 'utf8')).toBe(before)

    const baseline = JSON.parse(before)
    delete baseline.diagnostics[0].project
    const legacy = JSON.stringify(baseline)
    await writeFile(file, legacy)
    expect((await check('--fix', '--update-baseline')).code).toBe(2)
    expect(await readFile(file, 'utf8')).toBe(legacy)
  })

  it('keeps sibling baseline counts on a scoped refresh and migrates moved projects on a full refresh', async () => {
    const dir = await vueWorkspace()
    await writeFile(join(dir, 'x18n.config.json'), JSON.stringify({
      projects: ['apps/*'],
    }))
    const file = join(dir, '.x18n/check-baseline.json')
    const check = (...args: string[]): Promise<Result> => x18n(dir, [
      'check',
      '--only',
      'missing-key',
      '--json',
      ...args,
    ])
    expect((await check('--update-baseline')).code).toBe(0)
    const { diagnostics } = JSON.parse(await readFile(file, 'utf8'))
    const docs = diagnostics.find((entry: { path: string }) => entry.path.startsWith('apps/docs/'))
    // A merge can leave repeated entries for the sibling.
    await writeFile(file, JSON.stringify({
      diagnostics: [
        ...diagnostics,
        { ...docs, count: 2 },
      ],
    }))

    expect(json(await check('--project', 'apps/web')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect((await check('--project', 'apps/web', '--update-baseline')).code).toBe(0)
    expect(json(await check('--project', 'apps/docs')).data.baseline).toEqual({ suppressed: 1, fixed: 2 })

    expect((await x18n(dir, [
      'check',
      '--project',
      'apps/docs',
      '--only',
      'empty-translation',
      '--update-baseline',
    ])).code).toBe(0)
    expect(json(await check('--project', 'apps/docs')).data.baseline).toEqual({ suppressed: 1, fixed: 2 })

    await rename(join(dir, 'apps/docs'), join(dir, 'apps/manual'))
    const moved = await check()
    expect(moved.code).toBe(1)
    expect(json(moved).diagnostics).toMatchObject([
      { project: 'apps/manual', code: 'missing-key' },
    ])
    expect(json(moved).data.baseline).toEqual({ suppressed: 1, fixed: 3 })
    expect((await x18n(dir, ['check', '--update-baseline'])).code).toBe(0)
    expect(json(await x18n(dir, ['check', '--json'])).data.baseline.fixed).toBe(0)
    expect(json(await check('--project', 'apps/manual')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
  })

  it.each([
    { admin: 'apps/shop/admin', pattern: 'admin/locales/{locale}.json' },
    { admin: 'apps/admin', pattern: '../admin/locales/{locale}.json' },
  ])('tracks each project reporting the same diagnostic from $admin', async ({ admin, pattern }) => {
    const dir = await mkdtemp(join(work, 'shared-resource-'))
    const shop = join(dir, 'apps/shop')
    const locales = join(dir, admin, 'locales')
    await mkdir(shop, { recursive: true })
    await mkdir(locales, { recursive: true })
    await writeFile(join(locales, 'en.json'), '{"hello":"Hello"}')
    await writeFile(join(locales, 'de.json'), '{}')
    await writeFile(join(dir, 'x18n.config.json'), JSON.stringify({
      projects: ['apps/shop', admin],
      sourceLocale: 'en',
      checks: { 'missing-translation': 'error' },
    }))
    await writeFile(join(dir, admin, 'x18n.config.json'), JSON.stringify({
      name: 'admin',
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    }))
    const configureShop = (name: string, level: string): Promise<void> => writeFile(join(shop, 'x18n.config.json'), JSON.stringify({
      name,
      resources: [
        { pattern },
      ],
      checks: { 'missing-translation': level },
    }))
    const check = (...args: string[]): Promise<Result> => x18n(dir, [
      'check',
      '--only',
      'missing-translation',
      '--json',
      ...args,
    ])
    await configureShop('shop', 'off')
    expect((await check('--update-baseline')).code).toBe(0)
    await configureShop('shop', 'error')
    const fresh = await check('--project', 'shop')
    expect(fresh.code).toBe(1)
    expect(json(fresh).diagnostics).toMatchObject([
      { project: 'shop', key: 'hello' },
    ])
    expect(json(fresh).data.baseline).toEqual({ suppressed: 0, fixed: 0 })

    expect((await check('--project', 'shop', '--update-baseline')).code).toBe(0)
    const { diagnostics } = JSON.parse(await readFile(join(dir, '.x18n/check-baseline.json'), 'utf8'))
    expect(diagnostics).toHaveLength(2)
    for (const directory of ['apps/shop', admin]) {
      expect(diagnostics).toContainEqual(expect.objectContaining({
        project: { declaredIn: '.', directory },
        path: `${admin}/locales/en.json`,
        count: 1,
      }))
    }
    await configureShop('storefront', 'error')
    expect(json(await check('--project', 'storefront')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    await configureShop('storefront', 'off')
    expect(json(await check('--project', 'storefront')).data.baseline).toEqual({ suppressed: 0, fixed: 1 })
    expect((await check('--project', 'storefront', '--update-baseline')).code).toBe(0)
    expect(json(await check()).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
  })

  it('requires a workspace refresh of legacy entries even when just one project remains', async () => {
    const dir = await vueWorkspace()
    const web = join(dir, 'apps/web')
    const config = join(dir, '-ci.json')
    const file = join(dir, '001')
    await writeFile(config, JSON.stringify({
      projects: ['apps/web', 'apps/docs'],
    }))
    const check = (...args: string[]): Promise<Result> => x18n(web, [
      'check',
      '--config',
      '../../-ci.json',
      '--baseline',
      '../../001',
      '--json',
      ...args,
    ])
    const scoped = ['--project', 'apps/web']
    const legacy = {
      path: 'apps/docs/src/App.vue',
      code: 'missing-key',
      key: 'app.titel',
      locale: 'en',
      message: '"app.titel" is not defined in en.',
      count: 1,
    }
    await writeFile(file, JSON.stringify({
      diagnostics: [
        { ...legacy, count: 0 },
      ],
    }))
    expect((await check(...scoped, '--only', 'missing-key')).code).toBe(1)
    await writeFile(file, JSON.stringify({
      diagnostics: [legacy],
    }))
    expect(json(await check('--only', 'missing-key')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    const app = [
      'src/App.vue',
      ...scoped,
      '--only',
      'missing-key',
    ]
    const unknownRoot = await readFile(file, 'utf8')
    for (const flags of [
      [],
      ['--update-baseline'],
    ]) {
      expect((await check(...app, ...flags)).code).toBe(2)
      expect(await readFile(file, 'utf8')).toBe(unknownRoot)
    }
    // A recorded workspace makes the sibling file unambiguous even if the row has no project.
    const knownRoot = { ...legacy, workspace: '.' }
    await writeFile(file, JSON.stringify({
      diagnostics: [knownRoot],
    }))
    expect((await check(...app)).code).toBe(1)
    expect(json(await check(...app, '--update-baseline')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toContainEqual(knownRoot)
    await writeFile(file, unknownRoot)
    expect(json(await check(...scoped, '--skip', 'missing-key')).data.baseline).toEqual({ suppressed: 0, fixed: 0 })
    expect((await check(...scoped, '--only', 'empty-translation', '--update-baseline')).code).toBe(0)
    const before = await readFile(file, 'utf8')
    expect(JSON.parse(before).diagnostics).toContainEqual(legacy)
    expect(json(await check(...scoped, '--only', 'empty-translation')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    expect((await check('--project', 'apps/docs')).code).toBe(2)

    await writeFile(config, JSON.stringify({
      projects: ['apps/web'],
    }))
    const en = join(web, 'src/locales/en.json')
    const original = await readFile(en, 'utf8')
    for (const flags of [
      [],
      ['--fix'],
      ['--update-baseline', '--fix'],
    ]) {
      const refused = await check(...scoped, ...flags)
      expect(refused.code).toBe(2)
      const envelope = json(refused)
      expect(envelope).toMatchObject({ data: null, diagnostics: [] })
      const reason = envelope.errors[0].why
      expect(reason).toContain('same directory as this check')
      expect(reason).toContain('`x18n check --config ../../-ci.json --baseline ../../001`')
      expect(reason).toContain('`x18n check --config ../../-ci.json --baseline ../../001 --update-baseline`')
      expect(await readFile(file, 'utf8')).toBe(before)
      expect(await readFile(en, 'utf8')).toBe(original)
    }

    expect((await check()).code).toBe(1)
    expect((await check('--update-baseline')).code).toBe(0)
    expect(json(await check(...scoped, '--only', 'missing-key')).data.baseline).toEqual({ suppressed: 1, fixed: 0 })
    await check(...scoped, '--only', 'missing-key', '--fix')
    expect(JSON.parse(await readFile(en, 'utf8')).app.titel).toBe('')
  })

  it('preserves the working directory and paths for an executable config during migration', async () => {
    const dir = await vueWorkspace()
    const web = join(dir, 'apps/web')
    await writeFile(join(dir, 'ci.mjs'), `import { readFileSync } from 'node:fs'
export default { projects: JSON.parse(readFileSync('projects.json', 'utf8')) }`)
    await writeFile(join(web, 'projects.json'), '["apps/web"]')
    await writeFile(join(dir, 'projects.json'), '["apps/docs"]')
    const command = [
      'check',
      '--root',
      '../..',
      '--config',
      'ci.mjs',
      '--baseline',
      './001',
    ]
    const file = join(web, '001')
    expect((await x18n(web, [...command, '--update-baseline'])).code).toBe(0)
    const { diagnostics } = JSON.parse(await readFile(file, 'utf8'))
    expect(diagnostics.length).toBeGreaterThan(0)
    const legacy = diagnostics.map(({ project: _project, ...entry }: { project: unknown }) => entry)
    await writeFile(file, JSON.stringify({ diagnostics: legacy }))

    const selected = [
      ...command,
      '--project',
      'apps/web',
      '--json',
    ]
    const refused = await x18n(web, selected)
    expect(refused.code).toBe(2)
    const reason = json(refused).errors[0].why
    expect(reason).toContain('From the same directory as this check')
    expect(reason).toContain(`\`x18n ${command.join(' ')}\``)
    expect(reason).toContain(`\`x18n ${command.join(' ')} --update-baseline\``)
    expect(json(await x18n(web, [...command, '--json'])).data.baseline).toEqual({ suppressed: legacy.length, fixed: 0 })
    expect((await x18n(web, [...command, '--update-baseline'])).code).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8')).diagnostics).toEqual(diagnostics)
    expect((await x18n(web, selected)).code).toBe(0)
  })

  it('keeps shell-specific quoting with the caller when a migration path contains spaces', async () => {
    const dir = await vueWorkspace()
    const config = 'ci settings.json'
    await writeFile(join(dir, config), '{"projects":["apps/web","apps/docs"]}')
    const file = 'team\'s baseline.json'
    const legacy = {
      path: 'old.json',
      code: 'missing-key',
      message: 'old entry',
      count: 1,
    }
    await writeFile(join(dir, file), JSON.stringify({
      diagnostics: [legacy],
    }))
    const args = [
      'check',
      '--config',
      config,
      '--baseline',
      file,
    ]
    const refused = await x18n(dir, [
      ...args,
      '--project',
      'apps/web',
      '--json',
    ])
    expect(refused.code).toBe(2)
    const reason = json(refused).errors[0].why
    expect(reason).toContain('run `x18n check` with only the --root, --config and --baseline arguments you originally supplied')
    expect(reason).toContain('Copy those arguments with their original quoting')
    expect(reason).toContain('add `--update-baseline` to that command')
    expect(json(await x18n(dir, [...args, '--json'])).data.baseline.fixed).toBe(1)
    expect((await x18n(dir, [...args, '--update-baseline'])).code).toBe(0)
    expect((await x18n(dir, [...args, '--project', 'apps/web'])).code).toBe(0)
  })

  it('keeps inherited i18n-ally settings when migrating from a subdirectory', async () => {
    const dir = await fixture('vue-i18n')
    const src = join(dir, 'src')
    await mkdir(join(dir, '.vscode'))
    await writeFile(join(dir, '.vscode/settings.json'), '{"i18n-ally.localesPaths":["src/locales"]}')
    await mkdir(join(dir, 'other'))
    await writeFile(join(dir, 'other/x18n.config.json'), '{}')

    const file = join(dir, '.x18n/check-baseline.json')
    expect((await x18n(src, ['check', '--update-baseline'])).code).toBe(0)
    const { diagnostics } = JSON.parse(await readFile(file, 'utf8'))
    const legacy = diagnostics.map(({ project: _project, ...entry }: { project: unknown }) => entry)
    expect(legacy.length).toBeGreaterThan(0)
    await writeFile(file, JSON.stringify({ diagnostics: legacy }))

    // Starting at the root discovers other/x18n.config.json before the fallback settings.
    expect(json(await x18n(dir, ['check', '--json'])).data.baseline.fixed).toBe(legacy.length)
    const refused = await x18n(src, [
      'check',
      '--project',
      basename(dir),
      '--json',
    ])
    expect(refused.code).toBe(2)
    expect(json(refused).errors[0].why).toContain('From the same directory as this check, run `x18n check`')
    expect(json(await x18n(src, ['check', '--json'])).data.baseline.suppressed).toBe(legacy.length)
    expect((await x18n(src, ['check', '--update-baseline'])).code).toBe(0)
    expect(json(await x18n(src, [
      'check',
      '--project',
      basename(dir),
      '--json',
    ])).data.baseline).toEqual({ suppressed: legacy.length, fixed: 0 })
  })

  it('status, keys, get and locales return JSON', async () => {
    const dir = await fixture('i18next')
    const status = json(await x18n(dir, ['status', '--json'])).data.projects[0]
    expect(status).toMatchObject({ sourceLocale: 'en', resources: 4, keys: 6 })
    const keys = json(await x18n(dir, ['keys', '--json', '--limit', '2'])).data.projects[0]
    expect(keys).toMatchObject({
      total: 6,
      nextCursor: '2',
      keys: [
        { key: 'auth:login.submit' },
        { key: 'auth:login.title' },
      ],
    })
    const search = async (...args: string[]): Promise<string[]> => json(await x18n(dir, ['search', ...args, '--json'])).data.projects[0].matches.map((m: any) => `${m.key}:${m.locale}`)
    expect(await search('anmelden', '--exact')).toEqual(['auth:login.title:de', 'auth:login.submit:de'])
    expect(await search('sgn n')).toEqual(['auth:login.submit:en'])
    expect(await search('sgn n', '--exact')).toEqual([])
    const get = json(await x18n(dir, ['get', 'common:save', '--json'])).data.projects[0]
    expect(get.messages.map((m: any) => [m.locale, m.value])).toEqual([
      ['en', 'Save'],
      ['de', 'Speichern'],
    ])
    const locales = json(await x18n(dir, ['locales', '--json'])).data.projects[0]
    expect(locales.locales.map((l: any) => l.code)).toEqual(['en', 'de'])
  })

  it('review comments, suggests, applies and resolves', async () => {
    const dir = await fixture('i18next')
    const author = ['--author', 'Ada <ada@example.com>']
    expect((await x18n(dir, [
      'review',
      'request-change',
      'auth:login.title',
      '--locale',
      'de',
      '--text',
      'Too short',
      ...author,
    ])).code).toBe(0)
    expect((await x18n(dir, [
      'review',
      'suggest',
      'auth:login.title',
      '--locale',
      'de',
      '--value',
      'Einloggen',
      ...author,
    ])).code).toBe(0)
    const threads = json(await x18n(dir, ['review', 'list', '--json'])).data.projects[0].threads
    expect(threads).toMatchObject([
      {
        key: 'auth:login.title',
        locale: 'de',
        state: 'changes-requested',
        comments: [
          {
            type: 'request-change',
            text: 'Too short',
            author: { name: 'Ada', email: 'ada@example.com' },
          },
          { type: 'suggestion', suggestion: 'Einloggen' },
        ],
      },
    ])
    const [request, suggestion] = threads[0].comments
    const check = json(await x18n(dir, ['check', '--json']))
    expect(check.diagnostics.find((d: any) => d.code === 'review-changes-requested')).toMatchObject({ key: 'auth:login.title', locale: 'de', severity: 'info' })

    expect((await x18n(dir, ['review', 'apply-suggestion', suggestion.id])).code).toBe(0)
    expect(JSON.parse(await readFile(join(dir, 'public/locales/de/auth.json'), 'utf8')).login.title).toBe('Einloggen')
    expect((await x18n(dir, ['review', 'resolve', request.id])).code).toBe(0)
    expect((await x18n(dir, ['review', 'list', '--open'])).stdout).toBe('No open reviews.\n')
    expect((await x18n(dir, ['review', 'list'])).stdout).toContain('auth:login.title  de\n')
    expect(json(await x18n(dir, ['get', 'auth:login.title', '--json'])).data.projects[0].reviews[0].comments).toHaveLength(2)

    const missing = await x18n(dir, [
      'review',
      'comment',
      'auth:login.title',
      '--text',
      'Hm',
    ])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain('pass --locale <locale>')
  })

  it('doctor explains detected presets', async () => {
    const dir = await fixture('i18next')
    const projects = json(await x18n(dir, ['doctor', '--json'])).data.projects
    expect(projects[0].presets).toContainEqual({ name: 'react-i18next', reason: 'detected' })
    const { stdout } = await x18n(dir, ['doctor'])
    expect(stdout).toContain('config: none (detection only)\npresets:\n  ✓ react-i18next (detected)')
  })

  it('set, rename and delete write files; --dry-run does not', async () => {
    const dir = await fixture('vue-i18n')
    const en = join(dir, 'src/locales/en.json')
    const before = await readFile(en, 'utf8')
    const dry = await x18n(dir, [
      'set',
      'nav.contact',
      '--value',
      'Contact',
      '--dry-run',
    ])
    expect(dry.stdout).toContain('+     "contact": "Contact"')
    expect(await readFile(en, 'utf8')).toBe(before)

    expect((await x18n(dir, [
      'set',
      'nav.contact',
      '--value',
      'Contact',
    ])).code).toBe(0)
    expect(JSON.parse(await readFile(en, 'utf8')).nav.contact).toBe('Contact')

    expect((await x18n(dir, ['rename', 'nav.contact', 'nav.reach'])).code).toBe(0)
    expect(JSON.parse(await readFile(en, 'utf8')).nav).toEqual({ home: 'Home', about: 'About', reach: 'Contact' })

    expect((await x18n(dir, ['delete', 'nav.reach'])).code).toBe(0)
    expect(await readFile(en, 'utf8')).toBe(before)
  })

  it('delete --unused lists, keeps and deletes unused keys; --dry-run writes nothing', async () => {
    const dir = await fixture('vue-i18n')
    const en = join(dir, 'src/locales/en.json')
    const before = await readFile(en, 'utf8')
    const dry = await x18n(dir, ['delete', '--unused', '--dry-run'])
    expect(dry.code).toBe(0)
    expect(dry.stdout).toContain('delete unused  en src/locales/en.json, de src/locales/de.json\n')
    expect(dry.stdout).toMatch(/Would delete \d+ unused keys in 2 files \(dry run\)\.\n$/)
    expect(await readFile(en, 'utf8')).toBe(before)

    const plan = json(await x18n(dir, [
      'delete',
      '--unused',
      'unused',
      '--dry-run',
      '--json',
    ]))
    expect(plan.command).toBe('delete')
    expect(plan.data).toMatchObject({
      applied: false,
      keys: ['unused'],
      deleted: [
        {
          key: 'unused',
          messages: [
            { locale: 'en', file: 'src/locales/en.json' },
            { locale: 'de', file: 'src/locales/de.json' },
          ],
        },
      ],
      kept: [],
    })
    expect(plan.data.changes.map((c: { file: string }) => c.file).sort()).toEqual(['src/locales/de.json', 'src/locales/en.json'])
    expect(await readFile(en, 'utf8')).toBe(before)

    const done = json(await x18n(dir, [
      'delete',
      '--unused',
      'unused',
      '--json',
    ]))
    expect(done.data.applied).toBe(true)
    expect(JSON.parse(await readFile(en, 'utf8'))).not.toHaveProperty('unused')
    expect(JSON.parse(await readFile(join(dir, 'src/locales/de.json'), 'utf8'))).not.toHaveProperty('unused')
    expect(json(await x18n(dir, ['keys', '--unused', '--json'])).data.projects[0].keys).not.toContain('unused')
  })

  it('check --fix adds missing keys; --fix=unsafe also deletes unused ones; --dry-run writes nothing', async () => {
    const dir = await fixture('vue-i18n')
    const en = join(dir, 'src/locales/en.json')
    const de = join(dir, 'src/locales/de.json')
    const before = await readFile(en, 'utf8')

    const dry = await x18n(dir, ['check', '--fix', '--dry-run'])
    expect(dry.stderr).toContain('+     "titel": ""')
    expect(dry.stderr).toContain('Would fix 1 problem in 1 file (dry run).\n2 problems only have an unsafe fix; run with --fix=unsafe to apply them.\n')
    expect(dry.stdout).toContain('missing-key')
    expect(await readFile(en, 'utf8')).toBe(before)

    const safe = json(await x18n(dir, ['check', '--fix', '--json']))
    expect(safe.data.projects[0].fix).toEqual({
      applied: true,
      fixed: 1,
      skipped: 2,
      files: ['src/locales/en.json'],
      warnings: [],
    })
    expect(safe.diagnostics.map((d: { code: string }) => d.code)).not.toContain('missing-key')
    expect(JSON.parse(await readFile(en, 'utf8')).app.titel).toBe('')
    expect(JSON.parse(await readFile(en, 'utf8'))).toHaveProperty('unused')

    const unsafe = await x18n(dir, [
      'check',
      '--fix=unsafe',
      '--only',
      'unused-key',
    ])
    expect(unsafe.stderr).toContain('Fixed 2 problems in 2 files.\n')
    expect(unsafe.stdout).not.toContain('unused-key')
    expect(JSON.parse(await readFile(en, 'utf8'))).not.toHaveProperty('unused')
    expect(JSON.parse(await readFile(de, 'utf8'))).not.toHaveProperty('unused')
  })

  it('check refuses a --fix level it does not know, --fix with --watch and --dry-run without --fix', async () => {
    const dir = await fixture('vue-i18n')
    for (const args of [
      ['--fix=hard'],
      ['--fix', '--watch'],
      ['--dry-run'],
    ]) {
      const result = await x18n(dir, ['check', ...args, '--json'])
      expect(result.code).not.toBe(0)
      expect(json(result).errors[0].name).toBe('X18N4008')
    }
  })

  it('delete without a key or --unused is a usage error', async () => {
    const dir = await fixture('vue-i18n')
    const result = await x18n(dir, ['delete', '--json'])
    expect(result.code).not.toBe(0)
    expect(json(result).errors[0].name).toBe('X18N4008')
  })

  it('rename refuses an existing target with exit code 1', async () => {
    const dir = await fixture('vue-i18n')
    const result = await x18n(dir, [
      'rename',
      'nav.home',
      'nav.about',
      '--json',
    ])
    expect(result.code).toBe(1)
    expect(json(result).errors[0].name).toBe('X18N4002')
  })

  it('apply validates placeholders before writing', async () => {
    const dir = await fixture('vue-i18n')
    const bad = await x18n(dir, ['apply', '-', '--json'], JSON.stringify({
      de: { 'app.greeting': 'Hallo' },
    }))
    expect(bad.code).toBe(1)
    expect(json(bad).data.rejected).toEqual([
      {
        key: 'app.greeting',
        locale: 'de',
        missing: ['name'],
        extra: [],
      },
    ])
    const good = await x18n(dir, ['apply', '-'], JSON.stringify({
      de: { 'app.greeting': 'Hallo {name}', 'pages.about.title': 'Über uns' },
    }))
    expect(good.code).toBe(0)
    const de = JSON.parse(await readFile(join(dir, 'src/locales/de.json'), 'utf8'))
    expect(de.pages.about.title).toBe('Über uns')
  })

  it('fill adds missing keys', async () => {
    const dir = await fixture('vue-i18n')
    await x18n(dir, ['fill', '--copy-source'])
    const de = JSON.parse(await readFile(join(dir, 'src/locales/de.json'), 'utf8'))
    expect(de.pages.about.title).toBe('About us')
  })

  it('init writes a config, schema prints JSON Schema', async () => {
    const dir = await fixture('vue-i18n')
    const result = await x18n(dir, ['init'])
    expect(result.code).toBe(0)
    expect(await readFile(join(dir, 'x18n.config.ts'), 'utf8')).toContain('pattern: \'src/locales/{locale}.{ext}\'')
    expect(JSON.parse((await x18n(dir, ['schema', 'plugin'])).stdout).title).toBe('x18n YAML plugin')
  })

  it('errors on config problems with exit code 2', async () => {
    const dir = await fixture('vue-i18n')
    await writeFile(join(dir, 'x18n.config.json'), '{ "sourceLocal": "en" }')
    const result = await x18n(dir, ['status'])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('[X18N0001]')
  })

  it('reports stale translations from git history', async () => {
    const dir = await fixture('vue-i18n')
    const git = (args: string[], date: string): Promise<void> => new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: 'Ada',
        GIT_AUTHOR_EMAIL: 'ada@example.com',
        GIT_COMMITTER_NAME: 'Ada',
        GIT_COMMITTER_EMAIL: 'ada@example.com',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      }
      execFile('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, env }, error => error
        ? reject(error)
        : resolve())
    })
    await git(['init', '-q'], '')
    await git(['add', '-A'], '')
    await git(['commit', '-q', '-m', 'first'], '2026-01-01T00:00:00Z')
    const en = JSON.parse(await readFile(join(dir, 'src/locales/en.json'), 'utf8'))
    await writeFile(join(dir, 'src/locales/en.json'), JSON.stringify({
      ...en,
      app: { ...en.app, title: 'My Great App' },
    }, null, 2))
    await git(['commit', '-q', '-am', 'second'], '2026-02-01T00:00:00Z')

    const check = json(await x18n(dir, [
      'check',
      '--only',
      'stale-translation',
      '--json',
    ]))
    expect(check.diagnostics).toMatchObject([
      {
        code: 'stale-translation',
        key: 'app.title',
        locale: 'de',
        file: 'src/locales/de.json',
      },
    ])
    expect(check.diagnostics[0].message).toMatch(/^"app.title" in de is older than en \(source changed 2026-02-01 in [0-9a-f]{7}\)\.$/)
    expect(check.data.projects[0].coverage.find((c: any) => c.locale === 'de').outdated).toBe(1)
    const prompt = json(await x18n(dir, [
      'prompt',
      'translate',
      '--to',
      'de',
      '--stale',
      '--json',
    ]))
    expect(prompt.data.items.find((item: any) => item.key === 'app.title')).toMatchObject({ source: 'My Great App', previousSource: 'My App' })
    // `--check` loads the history too, for `stale-translation`.
    const checked = json(await x18n(dir, [
      'prompt',
      'translate',
      '--to',
      'de',
      '--check',
      'identical-to-source,stale-translation',
      '--json',
    ]))
    expect(checked.data.items.find((item: any) => item.key === 'app.title')).toMatchObject({
      previousSource: 'My App',
      issues: [
        { code: 'stale-translation' },
      ],
    })
  })

  it('shows the values of related locales in the translate prompt', async () => {
    const dir = await fixture('vue-i18n')
    await writeFile(join(dir, 'src/locales/de-CH.json'), JSON.stringify({
      app: { title: 'Meine App' },
    }, null, 2))
    const related = await x18n(dir, [
      'prompt',
      'translate',
      '--to',
      'de-CH',
      '--keys',
      'pages.home.*',
      '--no-context',
    ])
    expect(related.code).toBe(0)
    expect(related.stdout).toMatchSnapshot()
    const off = json(await x18n(dir, [
      'prompt',
      'translate',
      '--to',
      'de-CH',
      '--no-related',
      '--json',
    ]))
    expect(off.data.items.filter((item: any) => item.related)).toEqual([])
    // `--related` names the locales: the target itself and the source never count. Review prompts show them too.
    const named = json(await x18n(dir, [
      'prompt',
      'review',
      '--locale',
      'de',
      '--related',
      'de-CH,en',
      '--keys',
      'app.*',
      '--json',
    ]))
    expect(named.data.items.map((item: any) => [item.key, item.related])).toEqual([
      ['app.greeting', undefined],
      [
        'app.title',
        [
          { locale: 'de-CH', value: 'Meine App' },
        ],
      ],
    ])
  })

  it('prints the shipped skills as prompts', async () => {
    const dir = await fixture('vue-i18n')
    const setup = await x18n(dir, ['prompt', 'setup'])
    expect(setup.code).toBe(0)
    expect(setup.stdout).toContain('# Set up x18n')
    expect(setup.stdout).toContain('# Migrate from i18n-ally')
    expect(setup.stdout).not.toContain('name: x18n-setup')
    const check = await x18n(dir, ['prompt', 'check'])
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('x18n check')
    expect(check.stdout).not.toContain('name: x18n-check')
  })

  it('translate writes machine-translated values, and review approve --machine approves them in a batch', async () => {
    const dir = await fixture('vue-i18n')
    await writeFile(join(dir, 'fake-translator.mjs'), `export default () => ({
  name: 'fake',
  translators: [{
    id: 'fake',
    features: { placeholders: 'raw', context: true, feedback: true, update: true, glossary: 'prompt', batch: { maxItems: 20 }, paid: false },
    async translate(batch) {
      return { items: batch.items.map(item => ({ id: item.id, text: '[' + batch.to + '] ' + item.text })), model: 'fake-1' }
    },
  }],
})
`)
    await writeFile(join(dir, 'x18n.config.yml'), 'plugins:\n  - ./fake-translator.mjs\n')
    const estimate = json(await x18n(dir, [
      'translate',
      '--to',
      'de',
      '--estimate',
      '--json',
    ]))
    expect(estimate.data.items).toEqual([
      {
        key: 'nav.about',
        locale: 'de',
        translator: 'fake',
        kind: 'fresh',
      },
      {
        key: 'pages.about.title',
        locale: 'de',
        translator: 'fake',
        kind: 'fresh',
      },
    ])
    expect(estimate.data.estimate).toEqual([
      {
        translator: 'fake',
        items: 2,
        characters: 13,
        batches: 1,
        paid: false,
      },
    ])

    expect((await x18n(dir, ['translators'])).stdout).toBe('fake  placeholders: raw, context: yes, glossary: prompt, batch: 20, free\n  de: fake\n')

    const result = await x18n(dir, ['translate', '--to', 'de'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('2 translated: write 2 values (marked as machine-translated), suggest 0.')
    const de = JSON.parse(await readFile(join(dir, 'src/locales/de.json'), 'utf8'))
    expect(de.nav.about).toBe('[de] About')
    expect(de.pages.about.title).toBe('[de] About us')
    expect(await readFile(join(dir, '.x18n/reviews.yml'), 'utf8')).toContain('translator: fake')

    const preview = await x18n(dir, [
      'review',
      'approve',
      '--machine',
      '--dry-run',
    ])
    expect(preview.stdout).toBe('Would approve 2 messages:\n  nav.about  de  "[de] About"  (fake)\n  pages.about.title  de  "[de] About us"  (fake)\n')
    const approve = json(await x18n(dir, [
      'review',
      'approve',
      '--machine',
      '--author',
      'Ada',
      '--json',
    ]))
    expect(approve.data.approved).toHaveLength(2)
    expect(approve.data.applied).toBe(true)
    expect(json(await x18n(dir, [
      'review',
      'approve',
      '--machine',
      '--json',
    ])).data.approved).toEqual([])
    const batch = await x18n(dir, ['review', 'approve', '--locale', 'de'])
    expect(batch.code).toBe(1)
    expect(batch.stderr).toContain('pass <key>')
  })

  it('translate fails with a coded error when no translator is configured', async () => {
    const dir = await fixture('vue-i18n')
    const result = await x18n(dir, ['translate', '--to', 'de', '--json'])
    expect(result.code).toBe(1)
    expect(json(result).errors[0]).toMatchObject({ name: 'X18N6001', why: 'No translator for de' })
  })

  it('keeps the JSON contract of every read command', async () => {
    const dir = await fixture('vue-i18n')
    const name = basename(dir)
    for (const args of [
      ['status'],
      ['keys', '--values'],
      ['get', 'app.greeting'],
      ['search', 'my app'],
      ['usages'],
      ['locales'],
      ['check'],
      ['review', 'list'],
      ['delete', '--unused', '--dry-run'],
      [
        'prompt',
        'translate',
        '--to',
        'de',
        '--format',
        'json',
      ],
    ]) {
      const result = await x18n(dir, [...args, '--json'])
      expect(result.stdout.replaceAll(name, '<fixture>')).toMatchSnapshot(args.join(' '))
    }
  }, 60_000)
})

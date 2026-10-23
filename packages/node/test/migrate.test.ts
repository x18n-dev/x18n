import { cp, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadWorkspace, migrateI18nAlly } from '../src'

const fixtures = fileURLToPath(new URL('../../../test/fixtures/i18n-ally/', import.meta.url))
const dirs: string[] = []

async function fixture(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `x18n-migrate-${name}-`))
  dirs.push(dir)
  await cp(join(fixtures, name), dir, { recursive: true })
  await mkdir(join(dir, '.git'))
  return dir
}

async function migrateAndLoad(dir: string): Promise<Awaited<ReturnType<typeof migrateI18nAlly>> & { project: Awaited<ReturnType<typeof loadWorkspace>>['projects'][number]['project'] }> {
  const result = await migrateI18nAlly(dir, { format: 'json' })
  for (const file of result.files) {
    await mkdir(dirname(join(dir, file.path)), { recursive: true })
    await writeFile(join(dir, file.path), file.content)
  }
  const workspace = await loadWorkspace({ cwd: dir, cache: false })
  return { ...result, project: workspace.projects[0]!.project }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('migrate i18n-ally', () => {
  it('maps settings to a config and editor settings', async () => {
    const dir = await fixture('vue')
    const { files, notes, removable, project } = await migrateAndLoad(dir)
    const config = JSON.parse(files.find(f => f.path === 'x18n.config.json')!.content)
    expect(config).toEqual({
      $schema: 'https://x18n.antfu.dev/schema/config.json',
      sourceLocale: 'en',
      presets: ['vue-i18n'],
      resources: [
        { pattern: 'lang/{locale}/{namespaces}.json' },
      ],
      keyStyle: 'nested',
      usage: {
        keysInUse: ['dynamic.*'],
      },
      extract: { keyCase: 'snake' },
      plugins: ['./x18n/custom.x18n-plugin.yml'],
    })
    expect(files.find(f => f.path === 'x18n/custom.x18n-plugin.yml')!.content).toContain('flag: 🇬🇧')
    const vscode = files.find(f => f.path === '.vscode/settings.json')!.content
    expect(vscode).toContain('"x18n.displayLocale": "de"')
    expect(vscode).toContain('"x18n.annotationInPlace": false')
    expect(vscode).toContain('"x18n.showFlags": false')
    expect(vscode).toContain('"x18n.theme.annotation": "#999"')
    expect(vscode).toContain('// i18n-ally settings of a Vue project')
    expect(notes.some(n => n.includes('translate prompts'))).toBe(true)
    expect(removable).toContain('i18n-ally.localesPaths')

    expect(project.keys()).toEqual(['dynamic.a', 'home.title', 'home.unused'])
    expect(project.localeInfo('en').flag).toBe('🇬🇧')
    const analysis = project.analyze()
    expect(analysis.unused).toEqual(['home.unused'])
    expect(analysis.undefinedUsages.map(u => u.key)).toEqual(['home.missing'])
  })

  it('turns a custom framework into a YAML plugin', async () => {
    const dir = await fixture('custom')
    const { files, project } = await migrateAndLoad(dir)
    const config = JSON.parse(files.find(f => f.path === 'x18n.config.json')!.content)
    expect(config.presets).toEqual([])
    expect(files.find(f => f.path === 'x18n/custom.x18n-plugin.yml')!.content).toContain('- php')
    expect(project.usages().map(m => m.usage.key)).toEqual(['welcome'])
    expect(project.analyze().unused).toEqual(['bye'])
  })

  it('reads the settings and files of the i18n-ally-next fork first', async () => {
    const dir = await fixture('custom')
    await rename(join(dir, '.vscode/i18n-ally-custom-framework.yml'), join(dir, '.vscode/i18n-ally-next-custom-framework.yml'))
    await writeFile(join(dir, '.vscode/settings.json'), JSON.stringify({
      'i18n-ally.sourceLanguage': 'de',
      'i18n-ally-next.localesPaths': 'i18n',
      'i18n-ally-next.sourceLanguage': 'en',
    }))
    const { files, removable, project } = await migrateAndLoad(dir)
    const config = JSON.parse(files.find(f => f.path === 'x18n.config.json')!.content)
    expect(config.sourceLocale).toBe('en')
    expect(config.presets).toEqual([])
    expect(removable).toEqual([
      'i18n-ally.sourceLanguage',
      'i18n-ally-next.localesPaths',
      'i18n-ally-next.sourceLanguage',
      '.vscode/i18n-ally-next-custom-framework.yml',
    ])
    expect(project.usages().map(m => m.usage.key)).toEqual(['welcome'])
  })

  it('reports when there is nothing to migrate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'x18n-migrate-empty-'))
    dirs.push(dir)
    expect(await migrateI18nAlly(dir)).toEqual({
      files: [],
      notes: ['No i18n-ally settings found.'],
      removable: [],
    })
  })
})

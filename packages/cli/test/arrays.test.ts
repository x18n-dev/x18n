import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Git hooks set GIT_DIR and friends; they would point every git call here at the repo running the hook.
for (const name of Object.keys(process.env).filter(name => name.startsWith('GIT_')))
  delete process.env[name]

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))
let work: string

interface Result { stdout: string, stderr: string, code: number }

function x18n(cwd: string, args: string[]): Promise<Result> {
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args, '--no-cache'], {
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
  })
}

const json = (result: Result): any => JSON.parse(result.stdout)

async function project(script: string, messages: object = {
  list: ['A', 'B'],
  menu: { open: 'Open' },
  n: 'N',
}): Promise<string> {
  const dir = await mkdtemp(join(work, 'p-'))
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      dependencies: { 'vue-i18n': '*', 'vue': '*' },
    }),
    '.gitignore': '',
    'src/locales/en.json': `${JSON.stringify(messages, null, 2)}\n`,
    'src/A.vue': `<script setup>\nconst { t, tm } = useI18n()\n${script}\n</script>\n`,
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  return dir
}

const en = async (dir: string): Promise<any> => JSON.parse(await readFile(join(dir, 'src/locales/en.json'), 'utf8'))
const codes = (result: Result): string[] => json(result).diagnostics.map((d: { code: string }) => d.code)

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'x18n-cli-arrays-'))
})

afterAll(async () => {
  await rm(work, { recursive: true, force: true, maxRetries: 5 })
})

describe('x18n binary with arrays', { timeout: 30_000 }, () => {
  const used = 'tm(\'menu\')\nt(\'n\')'

  it('check finds no missing key and no unused item for tm() and a bracket path', async () => {
    const dir = await project(`tm('list')\nt('list[0]')\n${used}`)
    const result = await x18n(dir, ['check', '--json'])
    expect(codes(result)).toEqual([])
    expect(result.code).toBe(0)
  })

  it('check reports the items nothing reads', async () => {
    const dir = await project(`t('list[0]')\n${used}`)
    expect(codes(await x18n(dir, ['check', '--json']))).toEqual(['unused-key'])
  })

  describe('check --fix', () => {
    it('adds the item right after the last one', async () => {
      const dir = await project(`tm('list')\nt('list[2]')\n${used}`)
      const result = await x18n(dir, ['check', '--fix', '--json'])
      expect(json(result).data.projects[0].fix).toMatchObject({
        applied: true,
        fixed: 1,
        files: ['src/locales/en.json'],
        warnings: [],
      })
      expect((await en(dir)).list).toEqual(['A', 'B', ''])
    })

    it.each(['list[3]', 'list[9]', 'list[99999999]'])('skips %s with a warning and leaves the file as it is', async (key) => {
      const dir = await project(`tm('list')\nt('${key}')\n${used}`)
      const result = await x18n(dir, ['check', '--fix', '--json'])
      expect(json(result).data.projects[0].fix.warnings).toEqual([
        expect.stringContaining('is not added'),
      ])
      expect((await en(dir)).list).toEqual(['A', 'B'])
    })
  })

  describe('delete --unused', () => {
    it('empties the item in the middle and keeps the others where they are', async () => {
      const dir = await project(`t('list[0]')\nt('list[2]')\n${used}`, {
        list: ['A', 'B', 'C'],
        menu: { open: 'Open' },
        n: 'N',
      })
      const result = await x18n(dir, ['delete', '--unused', '--json'])
      expect(json(result).data).toMatchObject({
        applied: true,
        keys: ['list.1'],
      })
      expect((await en(dir)).list).toEqual(['A', '', 'C'])
    })

    it('cuts the items off the end, and removes the array when nothing reads it', async () => {
      const dir = await project(`t('list[0]')\n${used}`, {
        list: ['A', 'B', 'C'],
        menu: { open: 'Open' },
        n: 'N',
      })
      await x18n(dir, ['delete', '--unused', '--json'])
      expect((await en(dir)).list).toEqual(['A'])
      const gone = await project(used, {
        list: ['A', 'B', 'C'],
        menu: { open: 'Open' },
        n: 'N',
      })
      await x18n(gone, ['delete', '--unused', '--json'])
      expect(await en(gone)).not.toHaveProperty('list')
    })

    it('deletes nothing from an array that tm() reads', async () => {
      const dir = await project(`tm('list')\n${used}`)
      expect(json(await x18n(dir, [
        'delete',
        '--unused',
        '--dry-run',
        '--json',
      ])).data.keys).toEqual([])
    })
  })

  describe('set', () => {
    it('adds an item right after the last one', async () => {
      const dir = await project(`tm('list')\n${used}`)
      await x18n(dir, [
        'set',
        'list.2',
        '--value',
        'C',
        '--json',
      ])
      expect((await en(dir)).list).toEqual(['A', 'B', 'C'])
    })

    it('does not leave a gap', async () => {
      const dir = await project(`tm('list')\n${used}`)
      const result = await x18n(dir, [
        'set',
        'list.99999999',
        '--value',
        'X',
        '--json',
      ])
      expect((await en(dir)).list).toEqual(['A', 'B'])
      expect(result.stdout + result.stderr).toContain('is not added')
    })
  })
})

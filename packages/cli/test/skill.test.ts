import { execFile } from 'node:child_process'
import { glob, readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))
const run = promisify(execFile)

/** Every `x18n <command> ... --flag` in code spans and fenced code blocks of a text. */
function commandsIn(text: string): { command: string, flags: string[] }[] {
  const code = [
    ...[...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].flatMap(m => m[1]!.split('\n')),
    ...[...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]!),
  ]
  return code.flatMap((line) => {
    const match = /^x18n ([a-z]+(?: (?:translate|review|eject))?)\b(.*)$/.exec(line.trim())
    return match ? [{ command: match[1]!, flags: [...match[2]!.matchAll(/--([a-z-]+)/g)].map(m => m[1]!) }] : []
  })
}

const skillsDir = new URL('../../../skills/', import.meta.url)

/** Every markdown file of every skill, as `[url, text]`. */
async function skillFiles(): Promise<[URL, string][]> {
  const names = await Array.fromAsync(glob('*/**/*.md', { cwd: fileURLToPath(skillsDir) }))
  return Promise.all(names.map(async (name): Promise<[URL, string]> => {
    const url = new URL(name, skillsDir)
    return [url, await readFile(url, 'utf8')]
  }))
}

describe('shipped skills and prompts', () => {
  it('names each skill after its directory', async () => {
    const dirs = (await readdir(skillsDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()
    expect(dirs).toEqual(['x18n', 'x18n-check', 'x18n-setup'])
    for (const dir of dirs) {
      const skill = await readFile(new URL(`${dir}/SKILL.md`, skillsDir), 'utf8')
      expect(skill).toMatch(new RegExp(`^---\\nname: ${dir}\\ndescription: .+\\n---\\n`))
    }
  })

  it('links only to files that exist', async () => {
    for (const [url, text] of await skillFiles()) {
      for (const [, target] of text.matchAll(/\]\((?!https?:)([^)#]+)\)/g))
        await expect(readFile(new URL(target!, url), 'utf8'), target).resolves.toBeTruthy()
    }
  })

  it('only names commands and flags that exist', async () => {
    const skills = (await skillFiles()).map(([, text]) => text).join('\n')
    const prompt = await readFile(fileURLToPath(new URL('../../core/src/project/prompt.ts', import.meta.url)), 'utf8')
    const all = [...commandsIn(skills), ...commandsIn(prompt)]
    expect(all.length).toBeGreaterThan(10)
    const helps = new Map<string, string>()
    for (const { command, flags } of all) {
      const name = command.split(' ')[0]!
      if (!helps.has(name))
        helps.set(name, (await run(process.execPath, [bin, name, '--help'])).stdout)
      const help = helps.get(name)!
      expect(help, `x18n ${command}`).toContain(`x18n ${name}`)
      for (const flag of flags)
        expect(help, `x18n ${command} --${flag}`).toMatch(new RegExp(`--(?:no-)?${flag}\\b`))
    }
  }, 30_000)
})

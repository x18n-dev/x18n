import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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

describe('shipped skill and prompts', () => {
  it('links only to files that exist', async () => {
    const dir = new URL('../skills/x18n/', import.meta.url)
    const skill = await readFile(new URL('SKILL.md', dir), 'utf8')
    for (const [, target] of skill.matchAll(/\]\((?!https?:)([^)#]+)\)/g))
      await expect(readFile(new URL(target!, dir), 'utf8'), target).resolves.toBeTruthy()
  })

  it('only names commands and flags that exist', async () => {
    const skill = [
      await readFile(fileURLToPath(new URL('../skills/x18n/SKILL.md', import.meta.url)), 'utf8'),
      await readFile(fileURLToPath(new URL('../skills/x18n/references/migrate-i18n-ally.md', import.meta.url)), 'utf8'),
    ].join('\n')
    const prompt = await readFile(fileURLToPath(new URL('../../core/src/project/prompt.ts', import.meta.url)), 'utf8')
    const all = [...commandsIn(skill), ...commandsIn(prompt)]
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

import { glob, readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const skillsDir = new URL('../../../skills/', import.meta.url)

/** Every markdown file of every skill, as `[url, text]`. */
async function skillFiles(): Promise<[URL, string][]> {
  const names = await Array.fromAsync(glob('*/**/*.md', {
    cwd: fileURLToPath(skillsDir),
  }))
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
})

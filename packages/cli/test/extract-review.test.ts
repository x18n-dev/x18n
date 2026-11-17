import type { ExtractSelection } from '@x18n/builtins/extractors'
import { describe, expect, it, vi } from 'vitest'
import { review } from '../src/extract-review'

const readline = vi.hoisted(() => {
  const question = vi.fn(async () => '')
  const close = vi.fn()
  return {
    question,
    close,
    createInterface: vi.fn(() => ({ question, close })),
  }
})

vi.mock('node:readline/promises', () => ({
  createInterface: readline.createInterface,
}))

function selection(key: string, line = 1, text = 'Welcome aboard'): ExtractSelection {
  return {
    path: 'src/App.vue',
    line,
    kind: 'vue-template-text',
    text,
    original: text,
    range: {
      start: 0,
      end: text.length,
    },
    attribute: undefined,
    key,
    reused: false,
    value: text,
    replacement: `{{ $t('${key}') }}`,
    imports: [],
    alternatives: [],
    context: 'ctx',
  }
}

/** The review writes to stderr by default; tests collect the replies instead. */
const quiet = {
  write: (): void => {},
}

function answers(...replies: string[]): () => Promise<string> {
  return async () => replies.shift()!
}

describe('review', () => {
  it.each(['', 'y'])('keeps the proposed key and its replacement on %j', async (reply) => {
    const [row] = await review([
      selection('welcome'),
    ], {
      ...quiet,
      ask: answers(reply),
    })
    expect(row!.key).toBe('welcome')
    expect(row!.replacement).toBe('{{ $t(\'welcome\') }}')
  })

  it('changes the key only, never the replacement', async () => {
    const [row] = await review([
      selection('welcome'),
    ], {
      ...quiet,
      ask: answers('page.welcome'),
    })
    expect(row!.key).toBe('page.welcome')
    expect(row!.replacement).toBe('{{ $t(\'welcome\') }}')
  })

  it('skips a string on n and keeps the others', async () => {
    const rows = await review([
      selection('a'),
      selection('b'),
    ], {
      ...quiet,
      ask: answers('n', ''),
    })
    expect(rows.map(row => row.key)).toEqual(['b'])
  })

  it('stops at q without asking about the rest', async () => {
    let asked = 0
    const scripted = answers('', 'q')
    const rows = await review([
      selection('a'),
      selection('b'),
      selection('c'),
    ], {
      ...quiet,
      ask: async () => {
        asked++
        return scripted()
      },
    })
    expect(rows.map(row => row.key)).toEqual(['a'])
    expect(asked).toBe(2)
  })

  it('writes the string and its replacement before asking', async () => {
    const lines: string[] = []
    await review([
      selection('welcome'),
    ], {
      write: line => lines.push(line),
      label: path => `…/${path}`,
      ask: answers(''),
    })
    expect(lines).toEqual([
      '\n…/src/App.vue:1  "Welcome aboard"\n  → {{ $t(\'welcome\') }}\n',
    ])
  })

  it('opens one reader for the default prompt and closes it', async () => {
    readline.createInterface.mockClear()
    readline.question.mockClear()
    readline.close.mockClear()
    const rows = await review([
      selection('welcome'),
    ], quiet)
    expect(readline.createInterface).toHaveBeenCalledTimes(1)
    expect(readline.question).toHaveBeenCalledWith('Extract as "welcome"? [Y/n/key/q] ')
    expect(readline.close).toHaveBeenCalledTimes(1)
    expect(rows.map(row => row.key)).toEqual(['welcome'])
  })

  it('does not open a reader when the reader is injected', async () => {
    readline.createInterface.mockClear()
    const rows = await review([
      selection('welcome'),
    ], {
      ...quiet,
      ask: answers('n'),
    })
    expect(readline.createInterface).not.toHaveBeenCalled()
    expect(rows).toEqual([])
  })
})

import type { ExtractSelection } from '@x18n/builtins/extractors'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

export interface ExtractReviewOptions {
  /** Reads one reply. Defaults to a readline prompt on stdin. */
  readonly ask?: (candidate: ExtractSelection) => Promise<string>
  /** Shows a string and its proposed replacement. Defaults to stderr. */
  readonly write?: (line: string) => void
  /** Shortens a path for display. Defaults to the path as written in the selection. */
  readonly label?: (path: string) => string
}

/** One question per string: extract with the proposed key, a typed key, or skip. */
export async function review(candidates: readonly ExtractSelection[], options: ExtractReviewOptions = {}): Promise<ExtractSelection[]> {
  const write = options.write ?? ((line: string): void => {
    process.stderr.write(line)
  })
  const label = options.label ?? ((path: string): string => path)
  const rl = options.ask
    ? undefined
    : createInterface({ input: process.stdin, output: process.stderr })
  const ask = options.ask ?? ((candidate: ExtractSelection) => rl!.question(`Extract as "${candidate.key}"? [Y/n/key/q] `))
  const picked: ExtractSelection[] = []
  try {
    for (const candidate of candidates) {
      write(`\n${label(candidate.path)}:${candidate.line}  ${JSON.stringify(candidate.text)}\n  → ${candidate.replacement}\n`)
      const answer = await ask(candidate)
      const reply = String(answer ?? '').trim()
      if (reply === 'q')
        break
      if (reply === 'n')
        continue
      picked.push(reply && reply !== 'y'
        ? {
            ...candidate,
            key: reply,
          }
        : candidate)
    }
  }
  finally {
    rl?.close()
  }
  return picked
}

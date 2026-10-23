import type { ProgressResult, ProjectInfo } from '@x18n/lsp'
import { describe, expect, it } from 'vitest'
import { formatStatus, stamp } from '../src/model/log'

const project: ProjectInfo = {
  name: 'web',
  root: '/work/web',
  sourceLocale: 'en',
  displayLocale: 'de',
  keys: 10,
  locales: [],
}
const progress: ProgressResult = {
  projects: [
    {
      name: 'web',
      locales: [
        {
          locale: 'en',
          translated: 10,
          total: 10,
          missing: [],
          empty: [],
        },
        {
          locale: 'de',
          translated: 8,
          total: 10,
          missing: ['a'],
          empty: ['b'],
        },
      ],
    },
  ],
}

describe('output channel log', () => {
  it('stamps lines with the time', () => {
    expect(stamp('hello', new Date(2026, 0, 2, 3, 4, 5))).toBe('[03:04:05] hello')
  })

  it('lists projects with coverage per locale', () => {
    expect(formatStatus([project], progress)).toEqual([
      '1 project loaded',
      '  web  /work/web',
      '    10 keys, source en, display de',
      '    en 100% 10/10',
      '    de  80% 8/10  (1 missing, 1 empty)',
    ])
  })

  it('says what to do without a project', () => {
    expect(formatStatus([], { projects: [] })[0]).toContain('x18n init')
  })
})

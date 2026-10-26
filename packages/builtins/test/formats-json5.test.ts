import type { MessageOp } from '@x18n/core'
import { applyTextEdits, isX18nError, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { json5 } from '../src/formats/json5'

const format = json5().formats![0]!
const ctx = {
  path: 'locales/de.json5',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `// Header
{
  title: 'Meine App', // inline
  "quoted-key": "Hallo",
  'it\\'s': 'x',
  /* nav */
  nav: {
    home: 'Start',
    count: 0x10,
  },
}
`

describe('json5 format', () => {
  it('parses with the range of every key and value', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      'title': 'Meine App',
      'quoted-key': 'Hallo',
      'it\'s': 'x',
      'nav': { home: 'Start', count: 16 },
    })
    const quoted = ranges!.get(pathId(['quoted-key']))!
    expect(source.slice(quoted.key.start, quoted.key.end)).toBe('quoted-key')
    expect(source.slice(quoted.value.start, quoted.value.end)).toBe('Hallo')
    const escaped = ranges!.get(pathId(['it\'s']))!
    expect(source.slice(escaped.key.start, escaped.key.end)).toBe('it\\\'s')
    const count = ranges!.get(pathId(['nav', 'count']))!
    expect(source.slice(count.key.start, count.key.end)).toBe('count')
    expect(source.slice(count.value.start, count.value.end)).toBe('0x10')
  })

  it('sets values in place with the same quotes', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['title'],
        value: 'It\'s',
      },
      {
        type: 'set',
        path: ['quoted-key'],
        value: 'Moin',
      },
    ])).toBe(source.replace('\'Meine App\'', '\'It\\\'s\'').replace('"Hallo"', '"Moin"'))
  })

  it('adds and deletes keys in place, in the style of the file', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'about', 'title'],
        value: 'Über',
      },
    ])).toBe(source.replace('    count: 0x10,\n', '    count: 0x10,\n    about: {\n      title: \'Über\',\n    },\n'))
    expect(edit(source, [
      {
        type: 'delete',
        path: ['title'],
      },
    ])).toBe(source.replace('  title: \'Meine App\', // inline\n', ''))
    expect(edit('{\n  "a": "A"\n}\n', [
      {
        type: 'set',
        path: ['b-c'],
        value: 'B',
      },
    ])).toBe('{\n  "a": "A",\n  "b-c": "B"\n}\n')
    expect(edit('', [
      {
        type: 'set',
        path: ['a'],
        value: 'A',
      },
    ])).toBe('{\n  a: "A"\n}\n')
  })

  it('rejects invalid files with codes', () => {
    const code = (text: string): string | undefined => {
      try {
        format.parse(text, ctx)
      }
      catch (error) {
        return isX18nError(error)
          ? error.code
          : undefined
      }
      return undefined
    }
    expect(code('{ a: ')).toBe('X18N2002')
    expect(code('{ a: [1] }')).toBe('X18N2003')
    expect(() => format.edit!('{ a: ', [
      {
        type: 'delete',
        path: ['a'],
      },
    ], ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
  })
})

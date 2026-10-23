import type { MessageOp } from '@x18n/core'
import { applyTextEdits, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { properties } from '../src/formats/properties'
import { createTestProject } from './_utils'

const format = properties().formats![0]!
const ctx = {
  path: 'locales/messages_de.properties',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `# Header
! bang comment
app.title = Meine App
  indented: value
spaced value here
long = first \\
       second
unicode=\\u00e4\\t\\\\x
key\\ with\\=sep = v
empty=
`

describe('properties format', () => {
  it('parses separators, continuations and escapes', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      'app.title': 'Meine App',
      'indented': 'value',
      'spaced': 'value here',
      'long': 'first second',
      'unicode': 'ä\t\\x',
      'key with=sep': 'v',
      'empty': '',
    })
    const title = ranges!.get(pathId(['app.title']))!
    expect(source.slice(title.key.start, title.key.end)).toBe('app.title')
    expect(source.slice(title.value.start, title.value.end)).toBe('Meine App')
  })

  it('sets an existing value in place', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['app.title'],
        value: ' Neu\n',
      },
    ])).toBe(source.replace('Meine App', '\\ Neu\\n'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['long'],
        value: 'one',
      },
    ])).toBe(source.replace('first \\\n       second', 'one'))
  })

  it('appends new keys and deletes logical lines', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['a', 'b c'],
        value: 'x',
      },
    ])).toBe(`${source}a.b\\ c = x\n`)
    expect(edit('a = 1', [
      {
        type: 'set',
        path: ['b'],
        value: '2',
      },
    ])).toBe('a = 1\nb = 2\n')
    expect(edit(source, [
      {
        type: 'delete',
        path: ['long'],
      },
    ])).toBe(source.replace('long = first \\\n       second\n', ''))
  })

  it('serializes and round-trips', () => {
    const tree = {
      'a': { b: 'x = y' },
      'c': ' lead',
      '#d': 'ü',
    }
    const text = format.serialize!(tree, ctx)
    expect(text).toBe('a.b=x = y\nc=\\ lead\n\\#d=ü\n')
    expect(format.parse(text, ctx).tree).toEqual({ 'a.b': 'x = y', 'c': ' lead', '#d': 'ü' })
  })

  it('reports malformed escapes with a code', () => {
    expect(() => format.parse('a=\\u12', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
  })

  it('works through a project', async () => {
    const { project, files } = await createTestProject({ 'locales/de.properties': 'hello=Hallo\n' }, {
      resources: [
        { pattern: 'locales/{locale}.properties' },
      ],
    })
    expect(project.keys()).toEqual(['hello'])
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'bye',
        locale: 'de',
        value: 'Tschüss',
      },
    ]))
    expect(files.get('locales/de.properties')).toBe('hello=Hallo\nbye=Tschüss\n')
  })
})

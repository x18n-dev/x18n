import type { MessageOp } from '@x18n/core'
import { applyTextEdits, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { ftl } from '../src/formats/ftl'
import { createTestProject } from './_utils'

const format = ftl().formats![0]!
const ctx = {
  path: 'locales/de.ftl',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `### Resource comment

-brand = Firefox

# Shown on start
hello = Hallo { $name }!
multi =
    Erste Zeile
      eingerückt

    Dritte
login =
    .placeholder = E-Mail
    .title = Anmelden
save = Speichern
    .accesskey = S
`

describe('ftl format', () => {
  it('parses messages, terms, multiline values and attributes', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      '-brand': 'Firefox',
      'hello': 'Hallo { $name }!',
      'multi': 'Erste Zeile\n  eingerückt\n\nDritte',
      'login.placeholder': 'E-Mail',
      'login.title': 'Anmelden',
      'save': 'Speichern',
      'save.accesskey': 'S',
    })
    const hello = ranges!.get(pathId(['hello']))!
    expect(source.slice(hello.key.start, hello.key.end)).toBe('hello')
    expect(source.slice(hello.value.start, hello.value.end)).toBe('Hallo { $name }!')
    const title = ranges!.get(pathId(['login.title']))!
    expect(source.slice(title.key.start, title.key.end)).toBe('title')
    const multi = ranges!.get(pathId(['multi']))!
    expect(source.slice(multi.value.start, multi.value.end)).toBe('Erste Zeile\n      eingerückt\n\n    Dritte')
  })

  it('sets one value or attribute in place', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['hello'],
        value: 'Moin { $name }',
      },
    ])).toBe(source.replace('Hallo { $name }!', 'Moin { $name }'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['multi'],
        value: 'Eins',
      },
    ])).toBe(source.replace('multi =\n    Erste Zeile\n      eingerückt\n\n    Dritte', 'multi = Eins'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['login.title'],
        value: 'A\nB',
      },
    ])).toBe(source.replace('.title = Anmelden', '.title =\n        A\n        B'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['login'],
        value: 'Login',
      },
    ])).toBe(source.replace('login =\n', 'login = Login\n'))
  })

  it('adds messages and attributes', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['bye'],
        value: 'Tschüss',
      },
    ])).toBe(`${source}bye = Tschüss\n`)
    expect(edit(source, [
      {
        type: 'set',
        path: ['hello', 'title'],
        value: 'T',
      },
    ])).toBe(source.replace('Hallo { $name }!\n', 'Hallo { $name }!\n    .title = T\n'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['new.attr'],
        value: 'x',
      },
    ])).toBe(`${source}new =\n    .attr = x\n`)
  })

  it('deletes messages with their comment, attributes, and values', () => {
    expect(edit(source, [
      {
        type: 'delete',
        path: ['hello'],
      },
    ])).toBe(source.replace('# Shown on start\nhello = Hallo { $name }!\n', ''))
    expect(edit(source, [
      {
        type: 'delete',
        path: ['save.accesskey'],
      },
    ])).toBe(source.replace('    .accesskey = S\n', ''))
    expect(edit(source, [
      {
        type: 'delete',
        path: ['save'],
      },
    ])).toBe(source.replace('save = Speichern', 'save ='))
    const withoutLogin = edit(source, [
      {
        type: 'delete',
        path: ['login.placeholder'],
      },
      {
        type: 'delete',
        path: ['login.title'],
      },
    ])
    expect(withoutLogin).toBe(source.replace('login =\n    .placeholder = E-Mail\n    .title = Anmelden\n', ''))
  })

  it('serializes and round-trips', () => {
    const tree = {
      'a': 'A { $x }',
      'b': 'one\ntwo',
      'b.title': 'T',
      'c.label': 'L',
      'e': '',
    }
    const text = format.serialize!(tree, ctx)
    expect(text).toBe('a = A { $x }\nb =\n    one\n    two\n    .title = T\nc =\n    .label = L\ne = { "" }\n')
    expect(format.parse(text, ctx).tree).toEqual({ ...tree, e: '{ "" }' })
  })

  it('reports junk with a code', () => {
    expect(() => format.parse('hello world\n', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
    expect(() => format.parse('  .attr = x\n', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
  })

  it('works through a project', async () => {
    const { project, files } = await createTestProject({ 'locales/de.ftl': 'hello = Hallo\n' }, {
      resources: [
        { pattern: 'locales/{locale}.ftl' },
      ],
    })
    expect(project.keys()).toEqual(['hello'])
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'hello',
        locale: 'de',
        value: 'Moin',
      },
    ]))
    expect(files.get('locales/de.ftl')).toBe('hello = Moin\n')
  })
})

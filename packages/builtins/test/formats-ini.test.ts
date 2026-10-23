import type { MessageOp } from '@x18n/core'
import { applyTextEdits, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { ini } from '../src/formats/ini'
import { createTestProject } from './_utils'

const format = ini().formats![0]!
const ctx = {
  path: 'locales/de.ini',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `; top comment
title = Meine App

[nav]
home = Start ; inline comment
# hash comment
quoted = "Hallo \\"Welt\\""

[nav.sub]
single = 'a ; b'
empty =
`

describe('ini format', () => {
  it('parses sections into nesting, comments and quotes', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      title: 'Meine App',
      nav: {
        home: 'Start',
        quoted: 'Hallo "Welt"',
        sub: { single: 'a ; b', empty: '' },
      },
    })
    const home = ranges!.get(pathId(['nav', 'home']))!
    expect(source.slice(home.key.start, home.key.end)).toBe('home')
    expect(source.slice(home.value.start, home.value.end)).toBe('Start')
    const quoted = ranges!.get(pathId(['nav', 'quoted']))!
    expect(source.slice(quoted.value.start, quoted.value.end)).toBe('Hallo \\"Welt\\"')
  })

  it('sets values in place, keeping the quote style', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'home'],
        value: 'Heim',
      },
    ])).toBe(source.replace('= Start ;', '= Heim ;'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'quoted'],
        value: 'x',
      },
    ])).toBe(source.replace('"Hallo \\"Welt\\""', '"x"'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'sub', 'single'],
        value: 'y',
      },
    ])).toBe(source.replace('\'a ; b\'', '\'y\''))
    expect(edit(source, [
      {
        type: 'set',
        path: ['title'],
        value: 'a;b',
      },
    ])).toBe(source.replace('Meine App', '"a;b"'))
  })

  it('adds keys to their section, or a new section', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'about'],
        value: 'Über',
      },
    ])).toBe(source.replace('Welt\\""\n', 'Welt\\""\nabout = Über\n'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['top'],
        value: 'T',
      },
    ])).toBe(source.replace('title = Meine App\n', 'title = Meine App\ntop = T\n'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['footer', 'note'],
        value: 'N',
      },
    ])).toBe(`${source}\n[footer]\nnote = N\n`)
    expect(edit('[a]\n', [
      {
        type: 'set',
        path: ['top'],
        value: 'T',
      },
    ])).toBe('top = T\n[a]\n')
  })

  it('deletes a key line', () => {
    expect(edit(source, [
      {
        type: 'delete',
        path: ['nav', 'home'],
      },
    ])).toBe(source.replace('home = Start ; inline comment\n', ''))
  })

  it('serializes and round-trips', () => {
    const tree = {
      a: 'A',
      nav: {
        home: 'Start',
        sub: { x: ' padded ' },
      },
      other: { y: 'Y' },
    }
    const text = format.serialize!(tree, ctx)
    expect(text).toBe('a = A\n\n[nav]\nhome = Start\n\n[nav.sub]\nx = " padded "\n\n[other]\ny = Y\n')
    expect(format.parse(text, ctx).tree).toEqual(tree)
  })

  it('reports syntax errors with a code', () => {
    expect(() => format.parse('just a line\n', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
    expect(() => format.parse('a = "open\n', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
  })

  it('works through a project', async () => {
    const { project, files } = await createTestProject({ 'locales/de.ini': '[nav]\nhome = Start\n' }, {
      resources: [
        { pattern: 'locales/{locale}.ini' },
      ],
    })
    expect(project.keys()).toEqual(['nav.home'])
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'nav.about',
        locale: 'de',
        value: 'Über',
      },
    ]))
    expect(files.get('locales/de.ini')).toBe('[nav]\nhome = Start\nabout = Über\n')
  })
})

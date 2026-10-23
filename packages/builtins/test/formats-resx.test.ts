import type { MessageOp } from '@x18n/core'
import { applyTextEdits, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { resx } from '../src/formats/resx'

const format = resx().formats![0]!
const ctx = {
  path: 'Resources/SharedResource.de.resx',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <!--
    Microsoft ResX Schema
    <data name="Name1"><value>this is my long string</value><comment>this is a comment</comment></data>
  -->
  <xsd:schema id="root" xmlns="" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <xsd:element name="data" />
  </xsd:schema>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <data name="Hello" xml:space="preserve">
    <value>Hallo {0}</value>
    <comment>Greeting</comment>
  </data>
  <data name="Errors.Required" xml:space="preserve">
    <value>Pflicht &lt;b&gt; &amp; &#228;</value>
  </data>
  <data name="Empty" />
  <data name="Blank"></data>
  <data name="Logo" type="System.Resources.ResXFileRef, System.Windows.Forms">
    <value>logo.png;System.Byte[]</value>
  </data>
</root>
`

describe('resx format', () => {
  it('parses string data, decodes entities and skips comments and files', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      'Hello': 'Hallo {0}',
      'Errors.Required': 'Pflicht <b> & ä',
      'Empty': '',
      'Blank': '',
    })
    const hello = ranges!.get(pathId(['Hello']))!
    expect(source.slice(hello.key.start, hello.key.end)).toBe('Hello')
    expect(source.slice(hello.value.start, hello.value.end)).toBe('Hallo {0}')
  })

  it('sets values in place, escaping markup', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['Hello'],
        value: 'Hi <b> & {0}',
      },
    ])).toBe(source.replace('Hallo {0}', 'Hi &lt;b&gt; &amp; {0}'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['Empty'],
        value: 'x',
      },
    ]))
      .toBe(source.replace('<data name="Empty" />', '<data name="Empty" xml:space="preserve">\n    <value>x</value>\n  </data>'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['Blank'],
        value: 'y',
      },
    ]))
      .toBe(source.replace('<data name="Blank"></data>', '<data name="Blank" xml:space="preserve">\n    <value>y</value>\n  </data>'))
  })

  it('inserts new data before </root> and deletes whole elements', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['Bye "now"'],
        value: 'Tschüss',
      },
    ]))
      .toBe(source.replace('</root>', '  <data name="Bye &quot;now&quot;" xml:space="preserve">\n    <value>Tschüss</value>\n  </data>\n</root>'))
    expect(edit(source, [
      {
        type: 'delete',
        path: ['Hello'],
      },
    ]))
      .toBe(source.replace('  <data name="Hello" xml:space="preserve">\n    <value>Hallo {0}</value>\n    <comment>Greeting</comment>\n  </data>\n', ''))
  })

  it('keeps CRLF line endings and tab indents', () => {
    const text = '<root>\r\n\t<data name="a">\r\n\t\t<value>1</value>\r\n\t</data>\r\n</root>\r\n'
    expect(edit(text, [
      {
        type: 'set',
        path: ['b'],
        value: 'two\nlines',
      },
    ]))
      .toBe('<root>\r\n\t<data name="a">\r\n\t\t<value>1</value>\r\n\t</data>\r\n\t<data name="b" xml:space="preserve">\r\n\t\t<value>two\r\nlines</value>\r\n\t</data>\r\n</root>\r\n')
    expect(format.parse(text.replace('1', 'x\r\ny'), ctx).tree).toEqual({ a: 'x\ny' })
  })

  it('serializes a file with the standard headers and round-trips', () => {
    const text = format.serialize!({ 'a.b': 'x < y', 'c': '' }, ctx)
    expect(text).toContain('<resheader name="resmimetype">\n    <value>text/microsoft-resx</value>\n  </resheader>')
    expect(text.endsWith('  <data name="a.b" xml:space="preserve">\n    <value>x &lt; y</value>\n  </data>\n  <data name="c" xml:space="preserve">\n    <value></value>\n  </data>\n</root>\n')).toBe(true)
    expect(format.parse(text, ctx).tree).toEqual({ 'a.b': 'x < y', 'c': '' })
  })

  it('reads `</data >`, keeps an out-of-range character reference and fills `<value/>` next to a comment', () => {
    const text = '<root>\n  <data name="a">\n    <value/>\n    <comment>Shown on the button</comment>\n  </data >\n  <data name="b">\n    <comment>Title</comment>\n  </data>\n  <data name="c"><value>&#x110000;</value></data>\n</root>\n'
    expect(format.parse(text, ctx).tree).toEqual({ a: '', b: '', c: '&#x110000;' })
    expect(edit(text, [
      {
        type: 'set',
        path: ['a'],
        value: 'Save',
      },
    ])).toBe(text.replace('<value/>', '<value>Save</value>'))
    expect(edit(text, [
      {
        type: 'set',
        path: ['b'],
        value: 'Titel',
      },
    ])).toBe(text.replace('<data name="b">\n', '<data name="b">\n    <value>Titel</value>\n'))
  })

  it('does not add a string next to a file entry of the same name', () => {
    expect(() => edit(source, [
      {
        type: 'set',
        path: ['Logo'],
        value: 'x',
      },
    ])).toThrow(expect.objectContaining({ code: 'X18N4008' }))
    expect(edit(source, [
      {
        type: 'delete',
        path: ['Logo'],
      },
    ])).toBe(source)
  })

  it('reports malformed files with a code', () => {
    expect(() => format.parse('<root><data name="a"><value>x</value>', ctx)).toThrow(expect.objectContaining({ code: 'X18N2002' }))
    expect(() => edit('<root>', [
      {
        type: 'set',
        path: ['a'],
        value: 'x',
      },
    ])).toThrow(expect.objectContaining({ code: 'X18N2002' }))
  })
})

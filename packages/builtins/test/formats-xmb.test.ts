import type { MessageOp } from '@x18n/core'
import { applyTextEdits } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { xmb } from '../src/formats/xmb'

const format = xmb().formats![0]!
const ctx = {
  path: 'src/locale/messages.tr.xtb',
  locale: 'tr',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE messagebundle [
<!ELEMENT msg (#PCDATA|ph|source)*>
]>
<messagebundle handler="angular">
  <msg id="8889534073701065911" meaning="site intro"><source>src/app/app.html:1,3</source>Welcome, <ph name="INTERPOLATION"><ex>{{ name }}</ex>{{ name }}</ph>!</msg>
  <msg id="home.intro"><source>src/app/app.html:2</source><source>src/app/b.html:4</source>Tom &amp; Jerry</msg>
</messagebundle>
`

const translations = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE translationbundle>
<translationbundle lang="tr">
  <translation id="8889534073701065911">Hoş geldin, <ph name="INTERPOLATION"/>!</translation>
</translationbundle>
`

describe('xmb format', () => {
  it('reads XMB messages without their <source> locations', () => {
    expect(format.parse(source, { ...ctx, path: 'src/locale/messages.xmb' }).tree).toEqual({
      '8889534073701065911': 'Welcome, {$INTERPOLATION}!',
      'home.intro': 'Tom & Jerry',
    })
  })

  it('keeps the <ph> example when the source message changes', () => {
    const next = applyTextEdits(source, format.edit!(source, [
      {
        type: 'set',
        path: ['8889534073701065911'],
        value: 'Hi {$INTERPOLATION}',
      },
    ], ctx))
    expect(next).toContain('<source>src/app/app.html:1,3</source>Hi <ph name="INTERPOLATION"><ex>{{ name }}</ex>{{ name }}</ph></msg>')
  })

  it('reads, writes, adds and deletes XTB translations', () => {
    expect(format.parse(translations, ctx).tree).toEqual({ '8889534073701065911': 'Hoş geldin, {$INTERPOLATION}!' })
    const next = edit(translations, [
      {
        type: 'set',
        path: ['8889534073701065911'],
        value: 'Merhaba {$INTERPOLATION}',
      },
      {
        type: 'set',
        path: ['home.intro'],
        value: 'Tom & Jerry',
      },
    ])
    expect(next).toContain('<translation id="8889534073701065911">Merhaba <ph name="INTERPOLATION"/></translation>')
    expect(next).toContain('  <translation id="home.intro">Tom &amp; Jerry</translation>\n</translationbundle>')
    expect(format.parse(edit(next, [
      {
        type: 'delete',
        path: ['home.intro'],
      },
    ]), ctx).tree).toEqual({ '8889534073701065911': 'Merhaba {$INTERPOLATION}' })
  })
})

import type { MessageOp } from '@x18n/core'
import { applyTextEdits, isX18nError, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { ecmascript } from '../src/formats/ecmascript'
import { createTestProject } from './_utils'

const format = ecmascript().formats![0]!
const ctx = {
  path: 'locales/de.ts',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[], path = ctx.path): string => applyTextEdits(text, format.edit!(text, ops, { ...ctx, path }))

const source = `// Header
export default {
  title: 'Meine App',
  "quoted-key": "Hallo",
  nav: {
    home: \`Start\`, // inline
    1: 'eins',
  },
  count: -3,
  on: true,
  none: null,
} as const
`

function code(text: string, path = ctx.path): string | undefined {
  try {
    format.parse(text, { ...ctx, path })
  }
  catch (error) {
    return isX18nError(error)
      ? error.code
      : undefined
  }
  return undefined
}

describe('ecmascript format', () => {
  it('parses static objects with any key and literal kind', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      'title': 'Meine App',
      'quoted-key': 'Hallo',
      'nav': { home: 'Start', 1: 'eins' },
      'count': -3,
      'on': true,
      'none': null,
    })
    const quoted = ranges!.get(pathId(['quoted-key']))!
    expect(source.slice(quoted.key.start, quoted.key.end)).toBe('quoted-key')
    expect(source.slice(quoted.value.start, quoted.value.end)).toBe('Hallo')
    const home = ranges!.get(pathId(['nav', 'home']))!
    expect(source.slice(home.key.start, home.key.end)).toBe('home')
    expect(source.slice(home.value.start, home.value.end)).toBe('Start')
  })

  it('finds the object behind common module shapes', () => {
    const tree = { a: 'A' }
    expect(format.parse('module.exports = { a: \'A\' }\n', { ...ctx, path: 'de.cjs' }).tree).toEqual(tree)
    expect(format.parse('const messages = { a: \'A\' } as const\nexport default messages\n', ctx).tree).toEqual(tree)
    expect(format.parse('import type { M } from \'./m\'\nexport default { a: \'A\' } satisfies M\n', ctx).tree).toEqual(tree)
    expect(format.parse('export default defineMessages({ a: \'A\' })\n', ctx).tree).toEqual(tree)
    expect(format.parse('', ctx).tree).toEqual({})
  })

  it('sets existing values in place with the same quotes', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['title'],
        value: 'It\'s',
      },
    ])).toBe(source.replace('\'Meine App\'', '\'It\\\'s\''))
    expect(edit(source, [
      {
        type: 'set',
        path: ['quoted-key'],
        value: 'a"b',
      },
    ])).toBe(source.replace('"Hallo"', '"a\\"b"'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'home'],
        value: '${x}', // eslint-disable-line no-template-curly-in-string
      },
    ])).toBe(source.replace('`Start`', '`\\${x}`')) // eslint-disable-line no-template-curly-in-string
    expect(edit(source, [
      {
        type: 'set',
        path: ['count'],
        value: 4,
      },
    ])).toBe(source.replace('-3', '4'))
  })

  it('rewrites only the object for structural changes', () => {
    const added = edit(source, [
      {
        type: 'set',
        path: ['nav', 'about'],
        value: 'Über',
      },
    ])
    expect(added.startsWith('// Header\nexport default {\n')).toBe(true)
    expect(added.endsWith('} as const\n')).toBe(true)
    expect(format.parse(added, ctx).tree.nav).toEqual({ home: 'Start', 1: 'eins', about: 'Über' })
    const removed = edit('module.exports = {\n  a: \'A\',\n  b: \'B\',\n}\n', [
      {
        type: 'delete',
        path: ['a'],
      },
    ], 'de.cjs')
    expect(removed).toBe('module.exports = {\n  b: \'B\',\n}\n')
  })

  it('serializes and round-trips', () => {
    const tree = {
      'a': 'it\'s',
      'kebab-key': 'x',
      'nested': { b: 1, c: false, d: null },
      'empty': {},
    }
    const text = format.serialize!(tree, ctx)
    expect(text).toBe('export default {\n  a: \'it\\\'s\',\n  \'kebab-key\': \'x\',\n  nested: {\n    b: 1,\n    c: false,\n    d: null,\n  },\n  empty: {},\n}\n')
    expect(format.parse(text, ctx).tree).toEqual(tree)
    expect(format.serialize!({ a: 'A' }, { ...ctx, path: 'de.cjs' })).toBe('module.exports = {\n  a: \'A\',\n}\n')
  })

  it('rejects code that is not static, and syntax errors, with codes', () => {
    expect(code('export default { a: t(\'x\') }')).toBe('X18N2004')
    expect(code('export default { a: `x${y}` }')).toBe('X18N2004') // eslint-disable-line no-template-curly-in-string
    expect(code('export default { ...base }')).toBe('X18N2004')
    expect(code('export default { [key]: \'x\' }')).toBe('X18N2004')
    expect(code('export default function () {}')).toBe('X18N2004')
    expect(code('const a = 1')).toBe('X18N2004')
    expect(code('export default [\'a\']')).toBe('X18N2003')
    expect(code('export default {')).toBe('X18N2002')
  })

  it('works through a project', async () => {
    const { project, files } = await createTestProject({ 'locales/de.ts': 'export default {\n  hello: \'Hallo\',\n}\n' }, {
      resources: [
        { pattern: 'locales/{locale}.ts' },
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
    expect(files.get('locales/de.ts')).toBe('export default {\n  hello: \'Hallo\',\n  bye: \'Tschüss\',\n}\n')
  })
})

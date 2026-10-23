import type { MessageOp } from '@x18n/core'
import { applyTextEdits, isX18nError, pathId } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { php } from '../src/formats/php'
import { createTestProject } from './_utils'

const format = php().formats![0]!
const ctx = {
  path: 'lang/de/messages.php',
  locale: 'de',
  namespace: undefined,
  indent: undefined,
}
const edit = (text: string, ops: MessageOp[]): string => applyTextEdits(text, format.edit!(text, ops, ctx))

const source = `<?php

// Header comment
return [
    'title' => 'Meine \\'App\\'',
    "welcome" => "Hallo\\n\\"du\\"", # hash comment
    'nav' => array(
        'home' => 'Start', /* block */
        1 => 'eins',
    ),
    'count' => 3,
    'on' => true,
    'none' => null,
];
`

describe('php format', () => {
  it('parses static arrays, both syntaxes, escapes and scalars', () => {
    const { tree, ranges } = format.parse(source, ctx)
    expect(tree).toEqual({
      title: 'Meine \'App\'',
      welcome: 'Hallo\n"du"',
      nav: { home: 'Start', 1: 'eins' },
      count: 3,
      on: true,
      none: null,
    })
    const home = ranges!.get(pathId(['nav', 'home']))!
    expect(source.slice(home.key.start, home.key.end)).toBe('home')
    expect(source.slice(home.value.start, home.value.end)).toBe('Start')
    const one = ranges!.get(pathId(['nav', '1']))!
    expect(source.slice(one.key.start, one.key.end)).toBe('1')
  })

  it('sets existing values in place with the same quotes', () => {
    expect(edit(source, [
      {
        type: 'set',
        path: ['welcome'],
        value: 'Moin $x',
      },
    ])).toBe(source.replace('"Hallo\\n\\"du\\""', '"Moin \\$x"'))
    expect(edit(source, [
      {
        type: 'set',
        path: ['nav', 'home'],
        value: 'It\'s',
      },
    ])).toBe(source.replace('\'Start\'', '\'It\\\'s\''))
    expect(edit(source, [
      {
        type: 'set',
        path: ['count'],
        value: 4,
      },
    ])).toBe(source.replace('=> 3', '=> 4'))
  })

  it('rewrites only the array for structural changes', () => {
    const added = edit(source, [
      {
        type: 'set',
        path: ['nav', 'about'],
        value: 'Über',
      },
    ])
    expect(added.startsWith('<?php\n\n// Header comment\nreturn [\n')).toBe(true)
    // Integer-like keys come first: the tree is a JS object.
    expect(added).toContain('    \'welcome\' => "Hallo\\n\\"du\\"",\n    \'nav\' => [\n        \'1\' => \'eins\',\n        \'home\' => \'Start\',\n        \'about\' => \'Über\',\n    ],\n')
    expect(format.parse(added, ctx).tree.nav).toEqual({ home: 'Start', 1: 'eins', about: 'Über' })
    const removed = edit(source, [
      {
        type: 'delete',
        path: ['on'],
      },
    ])
    expect(format.parse(removed, ctx).tree).not.toHaveProperty('on')
  })

  it('serializes and round-trips', () => {
    const tree = {
      a: 'it\'s',
      nested: { b: 1, c: false },
      empty: {},
    }
    const text = format.serialize!(tree, ctx)
    expect(text).toBe('<?php\n\nreturn [\n    \'a\' => \'it\\\'s\',\n    \'nested\' => [\n        \'b\' => 1,\n        \'c\' => false,\n    ],\n    \'empty\' => [],\n];\n')
    expect(format.parse(text, ctx).tree).toEqual(tree)
  })

  it('rejects dynamic code and bad syntax with codes', () => {
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
    expect(code('<?php return [\'a\' => __(\'x\')];')).toBe('X18N2004')
    expect(code('<?php return [\'a\' => $x];')).toBe('X18N2004')
    expect(code('<?php return [\'a\' => \'x\' . \'y\'];')).toBe('X18N2004')
    expect(code('<?php return [\'a\' => "hi $name"];')).toBe('X18N2004')
    expect(code('<?php $lang[\'a\'] = \'x\';')).toBe('X18N2004')
    expect(code('<?php return [\'a\', \'b\'];')).toBe('X18N2003')
    expect(code('<?php return [\'a\' => \'x]')).toBe('X18N2002')
  })

  it('works through a project', async () => {
    const { project, files } = await createTestProject({ 'lang/de.php': '<?php\n\nreturn [\n    \'hello\' => \'Hallo\',\n];\n' }, {
      resources: [
        { pattern: 'lang/{locale}.php' },
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
    expect(files.get('lang/de.php')).toBe('<?php\n\nreturn [\n    \'hello\' => \'Moin\',\n];\n')
  })

  it('reads one-line arrays without a trailing comma', () => {
    const format = php().formats![0]!
    expect(format.parse('<?php return [\'a\' => \'A\', \'b\' => [\'c\' => 1]];', {
      path: 'x.php',
      locale: 'en',
      namespace: undefined,
      indent: undefined,
    }).tree).toEqual({
      a: 'A',
      b: { c: 1 },
    })
  })
})

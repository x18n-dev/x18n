import type { Plugin } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { vueI18n } from '../src/presets/vue-i18n'

/** The key rewrite the preset registers, as core calls it. */
function normalize(raw: string): string | undefined {
  const plugins = vueI18n().plugins as readonly Plugin[]
  return plugins.find(p => p.normalizeKey)?.normalizeKey?.(raw, { path: 'src/A.vue' })
}

describe('vue-i18n key normalizer', () => {
  describe('quoted segments', () => {
    it.each([
      ['a["b"]', 'a.b'],
      ['a[\'b\']', 'a.b'],
      ['a["b"].c', 'a.b.c'],
      ['a[0]["b"]', 'a.0.b'],
      ['a[ "b" ]', 'a.b'],
      ['list["0"]', 'list.0'],
      // The dots stay as written, as vue-i18n reads the brackets as one key.
      ['a["b.c"]', 'a.b.c'],
      // The other quote and a closing bracket are part of the key.
      ['a["it\'s"]', 'a.it\'s'],
      ['a["x]y"]', 'a.x]y'],
    ])('rewrites %s to %s', (raw, key) => {
      expect(normalize(raw)).toBe(key)
    })
  })

  describe('index segments', () => {
    it.each([
      ['list[0]', 'list.0'],
      ['list[12]', 'list.12'],
      ['list[0].title', 'list.0.title'],
      ['a[0][1]', 'a.0.1'],
      ['a.b[0].c[1]', 'a.b.0.c.1'],
      ['list[ 0 ]', 'list.0'],
    ])('rewrites %s to %s', (raw, key) => {
      expect(normalize(raw)).toBe(key)
    })
  })

  // Everything vue-i18n's own path resolver reads as null stays as written, so it keeps reporting a missing key.
  describe('paths vue-i18n does not read', () => {
    it.each([
      ['a.b.0', 'no bracket'],
      ['', 'empty'],
      ['a[0', 'unclosed bracket'],
      ['a[', 'bracket at the end'],
      ['a[]', 'empty bracket'],
      ['a[""]', 'empty quotes'],
      ['a[i]', 'a variable'],
      ['a[0+1]', 'an expression'],
      ['a[-1]', 'a negative index'],
      ['a[1.5]', 'a decimal'],
      ['a[1e1]', 'an exponent'],
      ['a["b]', 'unclosed quote'],
      ['a[\'b"]', 'mixed quotes'],
      ['a["b"x]', 'text after the quote'],
      ['a["b\\"c"]', 'an escaped quote'],
      ['a[0]b', 'text after the bracket'],
      ['a[0]]', 'a second closing bracket'],
      ['a[0].', 'a trailing dot'],
      ['a.[0]', 'a dot before the bracket'],
      ['a..b[0]', 'an empty segment'],
      ['.a[0]', 'a leading dot'],
      ['a [0]', 'a blank before the bracket'],
      ['a[0] .b', 'a blank after the bracket'],
    ])('leaves %j alone (%s)', (raw) => {
      expect(normalize(raw)).toBeUndefined()
    })
  })

  it('reads a leading bracket as the key of that name', () => {
    expect(normalize('[0]')).toBe('0')
    expect(normalize('["a"].b')).toBe('a.b')
  })

  it('keeps a namespace in front for core to split', () => {
    expect(normalize('home:list[0]')).toBe('home:list.0')
  })
})

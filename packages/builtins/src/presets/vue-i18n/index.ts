import type { CallSpec, Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { sfcBlocks } from '../../finders/sfc-blocks'
import { braces, linked } from '../../placeholders'

type Piece = { segment: string, end: number } | undefined

const blank = /\s/

/** The segment in the bracket that starts at `start` and the index after its `]`, or undefined when vue-i18n would not read it. */
function bracket(raw: string, start: number): Piece {
  let i = start + 1
  while (blank.test(raw[i] ?? ''))
    i++
  let segment: string
  const quote = raw[i]
  if (quote === '"' || quote === '\'') {
    // No escapes: the key ends at the next quote of the same kind.
    const close = raw.indexOf(quote, i + 1)
    if (close < 0)
      return undefined
    segment = raw.slice(i + 1, close)
    i = close + 1
  }
  else {
    const from = i
    while (/\d/.test(raw[i] ?? ''))
      i++
    segment = raw.slice(from, i)
  }
  if (!segment)
    return undefined
  while (blank.test(raw[i] ?? ''))
    i++
  return raw[i] === ']'
    ? { segment, end: i + 1 }
    : undefined
}

/** The plain name that starts at `start` and runs up to a `.` or a `[`. */
function plain(raw: string, start: number): Piece {
  let end = start
  while (end < raw.length && raw[end] !== '.' && raw[end] !== '[')
    end++
  const segment = raw.slice(start, end)
  // vue-i18n stops reading at a blank or a stray bracket inside a plain name.
  return segment && !/[\s\]]/.test(segment)
    ? { segment, end }
    : undefined
}

/**
 * Rewrites the bracket segments of a vue-i18n path (`list[0].title`) to `.` segments (`list.0.title`).
 * Returns undefined for a path without brackets or one vue-i18n does not read.
 */
function vueI18nKey(raw: string): string | undefined {
  if (!raw.includes('['))
    return undefined
  const segments: string[] = []
  let i = 0
  while (i < raw.length) {
    const piece = raw[i] === '['
      ? bracket(raw, i)
      : plain(raw, i)
    if (!piece)
      return undefined
    segments.push(piece.segment)
    i = piece.end
    if (raw[i] === '.') {
      // A dot is followed by a plain name, never by a bracket or the end.
      i++
      if (i === raw.length || raw[i] === '[')
        return undefined
    }
    else if (i < raw.length && raw[i] !== '[') {
      return undefined
    }
  }
  return segments.join('.')
}

const vueI18nParams: NonNullable<CallSpec['params']> = {
  arg: [1, 2],
  options: [
    'locale',
    'fallbackLocale',
    'default',
    'missing',
    'plural',
    'escapeParameter',
  ],
}

const vueI18nCalls: CallSpec[] = [
  {
    callee: [
      '$t',
      't',
      'tc',
      '$tc',
      'te',
      '$te',
      'i18n.t',
      'i18n.global.t',
      '$i18n.t',
      'i18n.tc',
      'i18n.te',
    ],
    params: vueI18nParams,
  },
  {
    callee: 'useI18n',
    factory: true,
    returns: ['t', 'tc', 'te'],
    params: vueI18nParams,
  },
  // `tm` returns the messages under the key, such as a list.
  {
    callee: ['tm', '$tm'],
    params: vueI18nParams,
    subtree: true,
  },
  {
    callee: 'useI18n',
    factory: true,
    returns: ['tm'],
    params: vueI18nParams,
    subtree: true,
  },
]

export function vueI18n(): Preset {
  return {
    name: 'vue-i18n',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:vue-i18n',
        calls: vueI18nCalls,
        normalizeKey: vueI18nKey,
        templates: [
          {
            template: '{{ $t(\'{key}\'{args}) }}',
            kinds: ['vue-template-text'],
          },
          {
            template: ':{attr}="$t(\'{key}\'{args})"',
            kinds: ['vue-attribute'],
          },
          {
            template: 't(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
            files: ['**/*.vue'],
            imports: ['import { useI18n } from \'vue-i18n\'', 'const { t } = useI18n()'],
          },
        ],
        placeholders: [
          {
            ...braces,
            implicit: ['n', 'count'],
          },
          linked,
        ],
      }),
      // vue-i18n passes `n` and `count` to plural messages.
      sfcBlocks(),
    ],
  }
}

export default vueI18n

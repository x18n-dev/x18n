import type { Check, DiagnosticInput, GlossaryEntry, KeyString, Plugin } from '@x18n/core'
import { comparePlaceholders, localeSpellingKey } from '@x18n/core'
import { shouldExtract } from '../extractors'

function list(items: readonly string[]): string {
  return items.join(', ')
}

export const missingKey: Check = {
  id: 'missing-key',
  defaultSeverity: 'error',
  description: 'A usage whose key is not defined in the source locale.',
  * run(ctx) {
    for (const usage of ctx.undefinedUsages()) {
      yield {
        key: usage.key,
        locale: ctx.sourceLocale,
        location: { path: usage.path, range: usage.range },
        message: `"${usage.key}" is not defined in ${ctx.sourceLocale}.`,
        fixes: [{ title: `Add "${usage.key}" to ${ctx.sourceLocale}`, ops: [{ type: 'set', key: usage.key!, locale: ctx.sourceLocale, value: '' }] }],
      }
    }
  },
}

export const missingTranslation: Check = {
  id: 'missing-translation',
  defaultSeverity: 'warning',
  description: 'A source-locale key that target locales lack. One diagnostic per key, at the source entry.',
  * run(ctx) {
    const missing = new Map<KeyString, string[]>()
    for (const coverage of ctx.coverage()) {
      if (coverage.locale === ctx.sourceLocale)
        continue
      for (const key of coverage.missing) {
        const locales = missing.get(key) ?? []
        missing.set(key, locales)
        locales.push(coverage.locale)
      }
    }
    for (const [key, locales] of missing) {
      const source = ctx.message(key, ctx.sourceLocale)
      yield {
        key,
        locale: ctx.sourceLocale,
        message: `"${key}" is missing in ${list(locales)}.`,
        fixes: [
          { title: `Add empty values in ${list(locales)}`, ops: locales.map(locale => ({ type: 'set' as const, key, locale, value: '' })) },
          ...source ? [{ title: 'Copy the source value', ops: locales.map(locale => ({ type: 'set' as const, key, locale, value: source.value })) }] : [],
        ],
      }
    }
  },
}

export const emptyTranslation: Check = {
  id: 'empty-translation',
  defaultSeverity: 'warning',
  description: 'A message with an empty string value.',
  * run(ctx) {
    for (const message of ctx.messages()) {
      if (message.value === '')
        yield { key: message.key, locale: message.locale, message: `"${message.key}" is empty in ${message.locale}.` }
    }
  },
}

export const keyConflict: Check = {
  id: 'key-conflict',
  defaultSeverity: 'error',
  description: 'A key that is both a leaf and a parent, or is duplicated across files of one locale.',
  * run(ctx) {
    const keys = new Set(ctx.keys())
    for (const key of keys) {
      const segments = key.split('.')
      for (let i = 1; i < segments.length; i++) {
        const parent = segments.slice(0, i).join('.')
        if (keys.has(parent))
          yield { key: parent, message: `"${parent}" is a message and also the parent of "${key}".` }
      }
      for (const locale of ctx.locales) {
        const copies = ctx.duplicates(key, locale)
        if (copies.length > 1) {
          const files = [...new Set(copies.map(m => ctx.resources.find(r => r.id === m.resource)?.path ?? m.resource))]
          yield { key, locale, message: `"${key}" is defined ${copies.length} times in ${locale} (${list(files)}).` }
        }
      }
    }
  },
}

export const localeCodeConflict: Check = {
  id: 'locale-code-conflict',
  defaultSeverity: 'warning',
  description: 'Locale codes that differ only in spelling, such as zh_CN and zh-CN.',
  * run(ctx) {
    const groups = new Map<string, string[]>()
    for (const locale of ctx.locales) {
      const id = localeSpellingKey(locale)
      const group = groups.get(id) ?? []
      groups.set(id, group)
      group.push(locale)
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        const resource = ctx.resources.find(r => r.locale === group[1])
        yield {
          locale: group[1],
          location: resource ? { path: resource.path, range: { start: 0, end: 0 } } : undefined,
          message: `Locale codes ${list(group)} differ only in spelling; they are separate locales.`,
        }
      }
    }
  },
}

export const unusedKey: Check = {
  id: 'unused-key',
  defaultSeverity: 'warning',
  description: 'A key with no usage, after keysInUse, derived keys and dynamic prefixes.',
  * run(ctx) {
    if (!ctx.hasScanners)
      return
    for (const key of ctx.unused()) {
      yield {
        key,
        message: `"${key}" is not used.`,
        fixes: [{ title: `Delete "${key}" in every locale`, ops: [{ type: 'delete', key, locales: 'all' }] }],
      }
    }
  },
}

export const placeholderMismatch: Check = {
  id: 'placeholder-mismatch',
  defaultSeverity: 'error',
  description: 'Target value placeholders differ from the source value.',
  * run(ctx) {
    for (const key of ctx.keys()) {
      const source = ctx.message(key, ctx.sourceLocale)
      if (typeof source?.value !== 'string')
        continue
      for (const locale of ctx.locales) {
        if (locale === ctx.sourceLocale)
          continue
        const target = ctx.message(key, locale)
        if (typeof target?.value !== 'string' || target.value === '')
          continue
        const { missing, extra } = comparePlaceholders(ctx.placeholderSyntaxes, source.value, target.value, ctx.placeholders)
        if (missing.length || extra.length) {
          const parts = [
            missing.length ? `missing ${list(missing)}` : '',
            extra.length ? `unexpected ${list(extra)}` : '',
          ].filter(Boolean)
          yield { key, locale, message: `"${key}" in ${locale} has different placeholders than ${ctx.sourceLocale}: ${parts.join('; ')}.` }
        }
      }
    }
  },
}

export const invalidSyntax: Check = {
  id: 'invalid-syntax',
  defaultSeverity: 'error',
  description: 'Message syntax errors (ICU, linked messages, nesting).',
  * run(ctx) {
    const keys = new Set(ctx.keys())
    const exists = (key: string): boolean => keys.has(key) || ctx.keys().some(k => k.startsWith(`${key}.`))
    for (const message of ctx.messages()) {
      if (typeof message.value !== 'string')
        continue
      const errors = [...ctx.syntaxErrors(message.value)]
      for (const placeholder of ctx.placeholders(message.value)) {
        if (placeholder.syntax === 'linked' && !exists(placeholder.name))
          errors.push(`linked message "${placeholder.name}" does not exist`)
      }
      for (const error of errors)
        yield { key: message.key, locale: message.locale, message: `"${message.key}" in ${message.locale}: ${error}.` }
    }
  },
}

export const dynamicKey: Check = {
  id: 'dynamic-key',
  defaultSeverity: 'off',
  description: 'A fully dynamic key that no check can follow.',
  * run(ctx) {
    for (const usage of ctx.usages()) {
      if (usage.dynamic === 'unknown')
        yield { location: { path: usage.path, range: usage.range }, message: `Dynamic key "${usage.raw}" cannot be checked.` }
    }
  },
}

export const identicalToSource: Check = {
  id: 'identical-to-source',
  defaultSeverity: 'off',
  description: 'A target value that equals the source value.',
  * run(ctx) {
    for (const message of ctx.messages()) {
      if (message.locale === ctx.sourceLocale || typeof message.value !== 'string' || message.value === '')
        continue
      if (ctx.message(message.key, ctx.sourceLocale)?.value === message.value)
        yield { key: message.key, locale: message.locale, message: `"${message.key}" in ${message.locale} is the same as in ${ctx.sourceLocale}.` }
    }
  },
}

const caseRules: Readonly<Record<string, RegExp>> = {
  camel: /^[a-z][a-zA-Z0-9]*$/,
  snake: /^[a-z][a-z0-9_]*$/,
  kebab: /^[a-z][a-z0-9-]*$/,
  pascal: /^[A-Z][a-zA-Z0-9]*$/,
}

export const keyStyle: Check = {
  id: 'key-style',
  defaultSeverity: 'off',
  description: 'A key that does not match a naming rule (options: case, pattern).',
  * run(ctx) {
    const rule = typeof ctx.options.case === 'string' ? caseRules[ctx.options.case] : undefined
    const pattern = typeof ctx.options.pattern === 'string' ? new RegExp(ctx.options.pattern) : undefined
    for (const key of ctx.keys()) {
      const path = key.slice(key.indexOf(':') + 1)
      if (rule && !path.split('.').every(segment => rule.test(segment)))
        yield { key, message: `"${key}" is not ${String(ctx.options.case)} case.` }
      else if (pattern && !pattern.test(key))
        yield { key, message: `"${key}" does not match ${pattern.source}.` }
    }
  },
}

export const hardString: Check = {
  id: 'hard-string',
  defaultSeverity: 'info',
  description: 'A hard-coded string that should probably be a message. On with `extract.autoDetect`.',
  * run(ctx) {
    if (!ctx.config.extract.autoDetect && ctx.config.checks['hard-string'] === undefined)
      return
    for (const hard of ctx.hardStrings()) {
      if (shouldExtract(hard.text, hard.kind))
        yield { location: { path: hard.path, range: hard.range }, message: `Hard-coded string "${hard.text}".` }
    }
  },
}

/** A term as a whole word, so "Home" does not match "Homepage". */
function wordPattern(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
}

function* glossaryDiagnostics(ctx: Parameters<Check['run']>[0], entry: GlossaryEntry): Generator<DiagnosticInput> {
  const term = wordPattern(entry.term)
  for (const key of ctx.keys()) {
    const source = ctx.message(key, ctx.sourceLocale)?.value
    if (typeof source !== 'string' || !term.test(source))
      continue
    for (const locale of ctx.locales) {
      const value = ctx.message(key, locale)?.value
      const expected = entry.doNotTranslate ? entry.term : entry.translations?.[locale]
      if (locale === ctx.sourceLocale || typeof value !== 'string' || value === '' || !expected)
        continue
      if (!wordPattern(expected).test(value))
        yield { key, locale, message: `"${key}" in ${locale} should use "${expected}" for "${entry.term}".` }
    }
  }
}

export const glossary: Check = {
  id: 'glossary',
  defaultSeverity: 'off',
  description: 'A glossary term translated differently from the glossary.',
  * run(ctx) {
    for (const entry of ctx.config.glossary)
      yield* glossaryDiagnostics(ctx, entry)
  },
}

export const allChecks: readonly Check[] = [
  missingKey,
  invalidSyntax,
  placeholderMismatch,
  keyConflict,
  missingTranslation,
  emptyTranslation,
  unusedKey,
  localeCodeConflict,
  dynamicKey,
  identicalToSource,
  keyStyle,
  hardString,
  glossary,
]

/** Every built-in check with its `recommended` severity. */
export function recommended(): Plugin {
  return { name: 'x18n:checks', checks: allChecks }
}

import type { Plugin, ResourceSpec } from '@x18n/core'

export const laravelResources: readonly ResourceSpec[] = [
  { pattern: 'lang/{locale}/{namespaces}.php' },
  { pattern: 'resources/lang/{locale}/{namespaces}.php' },
  { pattern: 'lang/{locale}.json' },
  { pattern: 'resources/lang/{locale}.json' },
]

/** Nested translation files are referenced as `dir/file.key`. */
export const laravelKey: Plugin['normalizeKey'] = raw => raw.includes('/')
  ? raw.replace(/\//g, '.')
  : undefined

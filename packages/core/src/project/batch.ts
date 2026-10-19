import type { EditOp, JsonValue, KeyString, LocaleCode, MessageLeaf, Placeholder } from '../types/model'
import type { PlaceholderSyntax } from '../types/plugin'
import type { Project } from '../types/project'
import { X18nError } from '../errors'
import { isJsonObject } from '../schema'

/** A value whose placeholders differ from the source value of its key. */
export interface PlaceholderProblem {
  readonly key: KeyString
  readonly locale: LocaleCode
  readonly missing: readonly string[]
  readonly extra: readonly string[]
}

function isLeaf(value: JsonValue): value is MessageLeaf {
  return value === null || typeof value !== 'object'
}

/** Parses the batch shape `{ "<locale>": { "<key>": "<value>" } }` (as in `x18n apply`) into set ops. */
export function parseMessageBatch(project: Project, data: JsonValue): EditOp[] {
  if (!isJsonObject(data))
    throw new X18nError('X18N4008', 'expected { "<locale>": { "<key>": "<value>" } }')
  const ops: EditOp[] = []
  for (const [locale, entries] of Object.entries(data)) {
    if (!isJsonObject(entries))
      throw new X18nError('X18N4008', `"${locale}" must map keys to values`)
    for (const [raw, value] of Object.entries(entries)) {
      if (!isLeaf(value))
        throw new X18nError('X18N4008', `"${locale}.${raw}" must be a string, number, boolean or null`)
      ops.push({ type: 'set', key: project.parseKey(raw), locale, value })
    }
  }
  return ops
}

/** Set ops whose value drops or adds placeholders compared to the source value. */
export type PlaceholderComparer = (source: string, target: string) => { readonly missing: string[], readonly extra: string[] }

/**
 * Compares the placeholders of a target value with its source. Key references (`@:key`) are not
 * parameters, and implicit names (vue-i18n `{n}` in plural messages) may be left out. Build it once per run.
 */
export function createPlaceholderComparer(
  syntaxes: readonly PlaceholderSyntax[],
  /** A cached lookup of every syntax's placeholders, as checks get it. */
  find: (value: string) => readonly Placeholder[] = value => syntaxes.flatMap(s => s.find(value)),
): PlaceholderComparer {
  const references = new Set(syntaxes.filter(s => s.reference).map(s => s.id))
  const implicit = new Set(syntaxes.flatMap(s => s.implicit ?? []))
  const seen = new Map<string, Set<string>>()
  const names = (text: string): Set<string> => {
    let found = seen.get(text)
    if (!found) {
      found = new Set(find(text).filter(p => !references.has(p.syntax) && !implicit.has(p.name)).map(p => p.name))
      seen.set(text, found)
    }
    return found
  }
  return (source, target) => {
    const expected = names(source)
    const actual = names(target)
    return {
      missing: [...expected].filter(name => !actual.has(name)).sort(),
      extra: [...actual].filter(name => !expected.has(name)).sort(),
    }
  }
}

export function placeholderProblems(project: Project, ops: readonly EditOp[]): PlaceholderProblem[] {
  const compare = createPlaceholderComparer(project.placeholderSyntaxes)
  return ops.flatMap((op) => {
    if (op.type !== 'set' || op.locale === project.sourceLocale || typeof op.value !== 'string')
      return []
    const source = project.message(op.key, project.sourceLocale)?.value
    if (typeof source !== 'string')
      return []
    const { missing, extra } = compare(source, op.value)
    return missing.length || extra.length ? [{ key: op.key, locale: op.locale, missing, extra }] : []
  })
}

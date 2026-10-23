import type { KeyId, KeyString } from './types/model'

/** Canonical string form of a key: `ns:a.b.c`, or `a.b.c` without namespace. */
export function joinKey(namespace: string | undefined, path: readonly string[]): KeyString {
  const dotted = path.join('.')
  return namespace === undefined
    ? dotted
    : `${namespace}:${dotted}`
}

/** Splits a key string. `namespaced` is false for projects without namespaces, where `:` is part of the key. */
export function splitKey(key: KeyString, namespaced = true): KeyId {
  const index = namespaced
    ? key.indexOf(':')
    : -1
  const namespace = index === -1
    ? undefined
    : key.slice(0, index)
  const rest = index === -1
    ? key
    : key.slice(index + 1)
  return {
    namespace,
    path: rest === ''
      ? []
      : rest.split('.'),
  }
}

/** True when `key` is `prefix` itself or lies under it (`a.b` is under `a`). */
export function isKeyUnder(key: KeyString, prefix: KeyString): boolean {
  if (key === prefix)
    return true
  const sep = prefix.endsWith(':')
    ? ''
    : '.'
  return key.startsWith(prefix + sep)
}

/** Replaces the `from` prefix of `key` with `to`. */
export function replaceKeyPrefix(key: KeyString, from: KeyString, to: KeyString): KeyString {
  return key === from
    ? to
    : to + key.slice(from.length)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Glob over paths. `**` spans separators, `*` and `?` stay inside a segment,
 * `{a,b}` alternates, `[...]` is a character class.
 */
export function globToRegExp(glob: string, separator = '/'): RegExp {
  const sep = escapeRegExp(separator)
  const notSep = `[^${sep}]`
  let out = ''
  let depth = 0
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!
    if (char === '*') {
      if (glob[i + 1] === '*') {
        const slashAfter = glob[i + 2] === separator
        const atStart = i === 0 || glob[i - 1] === separator
        i++
        if (slashAfter && atStart) {
          out += `(?:.*${sep})?`
          i++
        }
        else {
          out += '.*'
        }
      }
      else {
        out += `${notSep}*`
      }
    }
    else if (char === '?') {
      out += notSep
    }
    else if (char === '{') {
      depth++
      out += '(?:'
    }
    else if (char === '}' && depth > 0) {
      depth--
      out += ')'
    }
    else if (char === ',' && depth > 0) {
      out += '|'
    }
    else if (char === '[') {
      const close = glob.indexOf(']', i)
      if (close === -1) {
        out += '\\['
      }
      else {
        out += `[${glob.slice(i + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`
        i = close
      }
    }
    else {
      out += escapeRegExp(char)
    }
  }
  return new RegExp(`^${out}$`)
}

/** Matcher over key globs: `*` stays inside a segment, `**` spans segments. */
export function keyMatcher(globs: readonly string[]): (key: KeyString) => boolean {
  if (globs.length === 0)
    return () => false
  const regexes = globs.map(glob => globToRegExp(glob, '.'))
  return key => regexes.some(re => re.test(key))
}

/** Matcher over posix file paths. */
export function pathMatcher(globs: readonly string[]): (path: string) => boolean {
  if (globs.length === 0)
    return () => false
  const regexes = globs.map(glob => globToRegExp(glob.replace(/^\.\//, '')))
  return path => regexes.some(re => re.test(path))
}

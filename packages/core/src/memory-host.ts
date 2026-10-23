import type { Host } from './types/host'
import { pathMatcher } from './keys'

export interface MemoryHost extends Host {
  readonly files: Map<string, string>
}

/** A host over in-memory files, for tests, demos and agents that pass content directly. */
export function createMemoryHost(initial: Readonly<Record<string, string>> = {}, root = '/'): MemoryHost {
  const files = new Map(Object.entries(initial))
  return {
    root,
    files,
    readFile: async path => files.get(path),
    writeFile: async (path, content) => {
      files.set(path, content)
    },
    deleteFile: async (path) => {
      files.delete(path)
    },
    glob: async (patterns, options = {}) => {
      const include = pathMatcher(patterns)
      const ignore = pathMatcher(options.ignore ?? [])
      return [
        ...files.keys(),
      ].filter(path => include(path) && !ignore(path)).sort()
    },
  }
}

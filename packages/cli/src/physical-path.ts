import { readlinkSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'

function missing(error: unknown): boolean {
  const { code } = error as NodeJS.ErrnoException
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Resolve aliases even when the final path is missing, as with a deleted diagnostic or a new baseline. */
export function physicalPath(path: string): string {
  try {
    return realpathSync.native(path)
  }
  catch (error) {
    if (!missing(error))
      throw error
  }
  const parent = dirname(path)
  let target: string
  try {
    target = readlinkSync(path)
  }
  catch (error) {
    if (!missing(error))
      throw error
    return parent === path
      ? path
      : join(physicalPath(parent), basename(path))
  }
  // Let the filesystem interpret ".." after any intermediate symlink in its target.
  return physicalPath(isAbsolute(target)
    ? target
    : `${parent}${sep}${target}`)
}

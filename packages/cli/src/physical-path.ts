import { lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

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

function linkDestination(dir: string): string {
  const target = readlinkSync(dir)
  const { root: drive } = parse(target)
  let destination = drive || dirname(dir)
  for (const segment of target.slice(drive.length).split(sep)) {
    if (segment === '..') {
      // A symlink followed by ".." goes to the parent of its target.
      const parent = dirname(destination)
      const physical = physicalPath(`${destination}${sep}..`)
      destination = physicalPath(parent) === physical
        ? parent
        : physical
    }
    else {
      destination = join(destination, segment)
    }
  }
  return destination
}

/**
 * Expand links used to enter a workspace through directories skipped by config discovery.
 * A visible link can be a separate declaration, so keep its spelling in the target.
 */
export function discoveredPath(root: string, path: string): string {
  const relativePath = relative(root, path)
  const parts = relativePath.split(sep)
  const ignored = (part: string): boolean => part === 'node_modules' || (part.startsWith('.') && part !== '..')
  const first = parts.findIndex(ignored)
  if (first === -1 || isAbsolute(relativePath))
    return path
  let dir = resolve(root, ...parts.slice(0, first))
  let skipped = false
  for (const part of parts.slice(first)) {
    dir = resolve(dir, part)
    skipped ||= ignored(part)
    if (!skipped || !lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink())
      continue
    dir = discoveredPath(root, linkDestination(dir))
    skipped = relative(root, dir).split(sep).some(ignored)
  }
  return dir
}

/** Existing POSIX filenames that the old baseline writer encoded as this slash-separated path. */
export function legacyFileSpellings(root: string, path: string): string[] {
  const absolute = isAbsolute(path)
  const parts = (absolute
    ? path.slice(1)
    : path).split('/')
  const files: string[] = []
  function visit(dir: string, start: number): void {
    for (let end = start + 1; end <= parts.length; end++) {
      const file = resolve(dir, parts.slice(start, end).join('\\'))
      let stat
      try {
        stat = statSync(file, { throwIfNoEntry: false })
      }
      catch (error) {
        // Joining more segments only makes this candidate filename longer.
        if ((error as NodeJS.ErrnoException).code === 'ENAMETOOLONG')
          break
        throw error
      }
      if (stat && end === parts.length)
        files.push(file)
      else if (stat?.isDirectory())
        visit(file, end)
    }
  }
  visit(absolute ? sep : root, 0)
  return files
}

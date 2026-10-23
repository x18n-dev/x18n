import type { ManifestReader, Plugin } from '@x18n/core'
import { parse as parseYaml } from 'yaml'

function keysOf(value: unknown): string[] {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.keys(value)
    : []
}

function fieldsOf(data: unknown, fields: readonly string[]): string[] {
  if (typeof data !== 'object' || data === null)
    return []
  const entries = new Map(Object.entries(data))
  return fields.flatMap(field => keysOf(entries.get(field)))
}

/** Adapted from i18n-ally (MIT), src/packagesParsers/ */
export const packageJson: ManifestReader = {
  id: 'package.json',
  file: 'package.json',
  read: text => fieldsOf(JSON.parse(text), ['dependencies', 'devDependencies', 'peerDependencies']),
}

export const composerJson: ManifestReader = {
  id: 'composer.json',
  file: 'composer.json',
  read: text => fieldsOf(JSON.parse(text), ['require', 'require-dev']),
}

export const pubspecYaml: ManifestReader = {
  id: 'pubspec.yaml',
  file: 'pubspec.yaml',
  read: text => fieldsOf(parseYaml(text), ['dependencies', 'dev_dependencies']),
}

/** Every `gem 'name'` line, not just `rails-i18n` as in i18n-ally. */
export const gemfile: ManifestReader = {
  id: 'Gemfile',
  file: 'Gemfile',
  read: text => [
    ...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm),
  ].map(match => match[1]!),
}

/** The PEP 503 normalized name of a PEP 508 requirement: `Flask_Babel[async]>=4` is `flask-babel`. */
function requirementName(requirement: string): string[] {
  const name = /^\s*([a-z\d][\w.-]*)/i.exec(requirement)?.[1]
  return name
    ? [
        name.toLowerCase().replace(/[-_.]+/g, '-'),
      ]
    : []
}

/** TOML strings outside comments, up to the first `]` outside a string (`"i18nice[YAML]"` has none) when `toClose`. */
function tomlStrings(text: string, toClose: boolean): string[] {
  const out: string[] = []
  for (const match of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|#.*|(\])/g)) {
    if (match[3] && toClose)
      break
    const value = match[1] ?? match[2]
    if (value !== undefined)
      out.push(value)
  }
  return out
}

/** Reads the PEP 621, PEP 735 and Poetry dependency tables; dependency names need no full TOML parser. */
export const pyprojectToml: ManifestReader = {
  id: 'pyproject.toml',
  file: 'pyproject.toml',
  // Multi-line strings go first: their lines may start with `[` too.
  read: text => text.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '""').split(/^[ \t]*\[/m).flatMap((table) => {
    const header = /^\[?([^\]\n]+)\]/.exec(table)?.[1]?.trim()
    const body = table.slice(table.indexOf('\n') + 1)
    if (header === 'project') {
      const start = /^\s*dependencies\s*=\s*\[/m.exec(body)
      return start
        ? tomlStrings(body.slice(start.index + start[0].length), true).flatMap(requirementName)
        : []
    }
    // Every string in these tables is a requirement.
    if (header === 'project.optional-dependencies' || header === 'dependency-groups')
      return tomlStrings(body, false).flatMap(requirementName)
    if (header && /^tool\.poetry\.(?:group\.[\w-]+\.)?(?:dev-)?dependencies$/.test(header)) {
      // Keys may be quoted (`"zope.interface" = "^5"`) or dotted (`requests.version = "^2"`).
      return [
        ...body.matchAll(/^\s*(?:"([^"\n]+)"|'([^'\n]+)'|([\w-]+))\s*[.=]/gm),
      ].flatMap(match => requirementName((match[1] ?? match[2] ?? match[3])!)).filter(name => name !== 'python')
    }
    return []
  }),
}

export const requirementsTxt: ManifestReader = {
  id: 'requirements.txt',
  file: 'requirements.txt',
  // Lines starting with `-` are pip options (`-r other.txt`, `-e .`).
  read: text => text.split('\n').flatMap(line => line.trim().startsWith('-')
    ? []
    : requirementName(line)),
}

const cargoSection = /^\[\s*((?:workspace\.|target\.[^\]]+\.)?(?:dev-|build-)?dependencies)(?:\.([\w-]+))?\s*\]/
// `name = ...` or a dotted key: `name.workspace = true`, `"name".version = "1"`.
const cargoKey = /^\s*"?([\w-]+)"?\s*[.=]/

/**
 * Dependency names from `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[workspace.dependencies]`
 * and target tables, and `[dependencies.name]` headers. A renamed dependency reports its alias, not `package`. TOML puts each key on its own line, so a line scan is enough.
 */
export const cargoToml: ManifestReader = {
  id: 'Cargo.toml',
  file: 'Cargo.toml',
  read(text) {
    const names: string[] = []
    let inDependencies = false
    for (const line of text.split('\n')) {
      if (line.trimStart().startsWith('[')) {
        const section = cargoSection.exec(line.trim())
        inDependencies = section !== null && section[2] === undefined
        if (section?.[2])
          names.push(section[2])
        continue
      }
      const name = inDependencies
        ? cargoKey.exec(line)?.[1]
        : undefined
      if (name)
        names.push(name)
    }
    return names
  },
}

export function manifests(): Plugin {
  return {
    name: 'x18n:manifests',
    manifests: [
      packageJson,
      composerJson,
      pubspecYaml,
      gemfile,
      pyprojectToml,
      requirementsTxt,
      cargoToml,
    ],
  }
}

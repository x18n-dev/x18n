import type { ManifestReader, Plugin } from '@x18n/core'
import { parse as parseYaml } from 'yaml'

function keysOf(value: unknown): string[] {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : []
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
  read: text => [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map(match => match[1]!),
}

const cargoSection = /^\[\s*((?:workspace\.|target\.[^\]]+\.)?(?:dev-)?dependencies)(?:\.([\w-]+))?\s*\]/
const cargoKey = /^\s*"?([\w-]+)"?\s*=/

/**
 * Dependency names from `[dependencies]`, `[dev-dependencies]`, `[workspace.dependencies]` and target tables,
 * and `[dependencies.name]` headers. TOML puts each key on its own line, so a line scan is enough.
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
      const name = inDependencies ? cargoKey.exec(line)?.[1] : undefined
      if (name)
        names.push(name)
    }
    return names
  },
}

export function manifests(): Plugin {
  return { name: 'x18n:manifests', manifests: [packageJson, composerJson, pubspecYaml, gemfile, cargoToml] }
}

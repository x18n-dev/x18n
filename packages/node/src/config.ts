import type { JsonObject, Plugin, Preset, UserConfig } from '@x18n/core'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileYamlPlugin } from '@x18n/builtins/yaml-plugin'
import { isX18nError, PluginFileSchema, validate, X18nError } from '@x18n/core'
import { createJiti } from 'jiti'
import { glob } from 'tinyglobby'
import { parse as parseYaml } from 'yaml'

export const configFileNames: readonly string[] = [
  'x18n.config.ts',
  'x18n.config.mts',
  'x18n.config.js',
  'x18n.config.mjs',
  'x18n.config.yml',
  'x18n.config.yaml',
  'x18n.config.json',
]

/** The config file in `dir`, if any. */
export function findConfigFile(dir: string): string | undefined {
  for (const name of configFileNames) {
    const file = join(dir, name)
    if (existsSync(file))
      return file
  }
  return undefined
}

/** The nearest config file at or above `cwd`, stopping at the git root. */
export function findConfigUpward(cwd: string): string | undefined {
  let dir = resolve(cwd)
  while (true) {
    const found = findConfigFile(dir)
    if (found)
      return found
    const parent = dirname(dir)
    if (parent === dir || existsSync(join(dir, '.git')))
      return undefined
    dir = parent
  }
}

const core = fileURLToPath(import.meta.resolve('@x18n/core'))
const presets = fileURLToPath(import.meta.resolve('@x18n/builtins/presets'))

// Configs and plugins import x18n's own packages; resolve them to the copies x18n runs from,
// so a project needs no install of its own (`npx @x18n/cli`, a config written by `x18n init`).
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  interopDefault: true,
  alias: {
    '@x18n/core': core,
    '@x18n/cli/presets': presets,
    '@x18n/cli': core,
    '@x18n/builtins/presets': presets,
  },
})

/** Imports a JS or TS module (config, plugin, executed resource). */
export async function importModule(file: string): Promise<unknown> {
  return jiti.import(pathToFileURL(file).href, { default: true })
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export async function loadConfigFile(file: string): Promise<UserConfig> {
  try {
    if (/\.ya?ml$/.test(file)) {
      const data: unknown = parseYaml(await readFile(file, 'utf8'))
      return (data ?? {}) as UserConfig // validated by `resolveConfig` against `ConfigSchema`
    }
    if (file.endsWith('.json'))
      return JSON.parse(await readFile(file, 'utf8')) as UserConfig // validated by `resolveConfig`
    const loaded = await importModule(file)
    const config = typeof loaded === 'function' ? await (loaded as () => unknown)() : loaded
    if (!isObject(config))
      throw new X18nError('X18N0002', `${file} does not export a config object`)
    return config as UserConfig // TS configs are typed by `defineConfig`; `resolveConfig` validates the serializable part
  }
  catch (error) {
    if (isX18nError(error))
      throw error
    throw new X18nError('X18N0002', `${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Loads a YAML plugin file (`*.x18n-plugin.yml`). */
export async function loadYamlPlugin(file: string): Promise<Plugin | Preset> {
  const data: unknown = parseYaml(await readFile(file, 'utf8'))
  const result = validate(PluginFileSchema, data)
  if (!result.success)
    throw new X18nError('X18N1004', `${file}: ${result.issues.map(i => `${i.path || '(root)'}: ${i.message}`).join('; ')}`)
  return compileYamlPlugin(result.output)
}

function isPluginLike(value: unknown): value is Plugin | Preset {
  return isObject(value) && 'name' in value && typeof value.name === 'string'
}

/** Resolves a plugin specifier relative to the config directory: a YAML file, a module path, or a package name. */
export function createPluginLoader(dir: string): (specifier: string, options: JsonObject | undefined) => Promise<Plugin | Preset> {
  return async (specifier, options) => {
    try {
      const local = specifier.startsWith('.') || isAbsolute(specifier)
      const file = local ? resolve(dir, specifier) : createRequire(join(dir, 'package.json')).resolve(specifier)
      if (/\.ya?ml$/.test(file))
        return await loadYamlPlugin(file)
      const loaded = await importModule(file)
      const plugin = typeof loaded === 'function' ? (loaded as (options: JsonObject | undefined) => unknown)(options) : loaded
      if (!isPluginLike(plugin))
        throw new Error('the module does not export a plugin or a plugin factory')
      return plugin
    }
    catch (error) {
      if (isX18nError(error))
        throw error
      throw new X18nError('X18N1001', `${specifier}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/** Workspace package directories of `root`, from `pnpm-workspace.yaml` or the `workspaces` field of `package.json`. */
async function workspacePackages(root: string): Promise<string[]> {
  const pnpm: unknown = parseYaml(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8').catch(() => '') || '{}')
  const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8').catch(() => '{}'))
  const field = (value: unknown, key: string): unknown => typeof value === 'object' && value !== null && key in value ? new Map(Object.entries(value)).get(key) : undefined
  const workspaces = field(manifest, 'workspaces')
  const patterns = [field(pnpm, 'packages'), workspaces, field(workspaces, 'packages')]
    .flatMap(list => Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [])
  if (patterns.length === 0)
    return []
  const manifests = await glob(patterns.filter(p => !p.startsWith('!')).map(p => `${p.replace(/\/$/, '')}/package.json`), { cwd: root, ignore: ['**/node_modules/**', ...patterns.filter(p => p.startsWith('!')).map(p => p.slice(1))] })
  return manifests.map(file => dirname(file)).sort()
}

/**
 * Directories, relative to `root`, whose manifests count for preset detection: the parents up to the
 * git root (`..`, `../..`), and the workspace packages of a monorepo root, where the i18n library is often listed.
 */
export async function manifestRootsOf(root: string, gitRoot: string | undefined): Promise<string[]> {
  const out: string[] = []
  const top = gitRoot ?? resolve(root)
  let dir = resolve(root)
  while (dir !== top && dir.startsWith(top)) {
    dir = dirname(dir)
    out.push(relative(root, dir).replace(/\\/g, '/'))
  }
  return [...out, ...await workspacePackages(root)]
}

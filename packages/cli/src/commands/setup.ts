import type { NamespaceFromPath, PluginFile } from '@x18n/core'
import type { GlobalOptions } from '../context'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { namespaceFromPath } from '@x18n/builtins/finders'
import { errors, PluginFileSchema, validate } from '@x18n/core'
import { configFileNames, findConfigFile, loadWorkspace } from '@x18n/node'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { cwd, out, printJson } from '../context'

export async function schema(name: string | undefined, options: GlobalOptions): Promise<void> {
  const which = name ?? 'config'
  if (which !== 'config' && which !== 'plugin' && which !== 'reviews')
    throw errors.X18N0001({ issue: `unknown schema "${which}" (config, plugin, reviews)` })
  const require = createRequire(import.meta.url)
  const text = await readFile(require.resolve(`@x18n/core/schema/${which}.json`), 'utf8')
  if (options.json) {
    printJson('schema', {
      name: which,
      schema: JSON.parse(text),
    })
  }
  else {
    out(text)
  }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The folders and file name that name `namespace`, in the style of `namespace.fromPath`. */
function namespaceSpan(parts: readonly string[], namespace: string, fromPath: NamespaceFromPath): { start: number, end: number } | undefined {
  for (let start = 0; start < parts.length; start++) {
    for (let end = start + 1; end <= parts.length; end++) {
      if (namespaceFromPath(parts.slice(start, end).join('/'), fromPath) === namespace)
        return { start, end }
    }
  }
}

/** The resource pattern that matches a found file: `public/locales/en/common.json` → `public/locales/{locale}/{namespaces}.{ext}`. */
function patternOf(resource: { readonly path: string, readonly locale: string, readonly namespace: string | undefined }, fromPath: NamespaceFromPath): string {
  const parts = resource.path.replace(/\.[^./]+$/, '').split('/')
  const span = resource.namespace === undefined
    ? undefined
    : namespaceSpan(parts, resource.namespace, fromPath)
  if (span)
    parts.splice(span.start, span.end - span.start, '{namespaces}')
  const pattern = `${parts.join('/')}.{ext}`
  return pattern.replace(new RegExp(`(^|[/._-])${escapeRegExp(resource.locale)}(?=[/._-])`), '$1{locale}')
}

export async function init(options: GlobalOptions & { readonly format?: string | undefined, readonly force?: boolean | undefined }): Promise<void> {
  const root = resolve(options.root ?? cwd())
  const existing = findConfigFile(root)
  if (existing && !options.force)
    throw errors.X18N0001({ issue: `${existing} already exists (pass --force to replace it)` })
  const workspace = await loadWorkspace({ cwd: root, cache: false })
  const loaded = workspace.projects[0]!
  const { project } = loaded
  const explanation = project.explain()
  const detected = explanation.presets.filter(p => p.reason === 'detected' && p.name !== 'general').map(p => p.name)
  // Patterns of the files found, not every default of the detected presets.
  const resources = [
    ...new Set(project.resources.filter(r => !r.block).map(r => patternOf(r, project.config.namespace.fromPath))),
  ]
  const config = {
    sourceLocale: project.sourceLocale,
    resources: resources.map(pattern => ({ pattern })),
  }
  const format = options.format ?? 'ts'
  let file: string
  let content: string
  if (format === 'yml' || format === 'yaml') {
    file = join(root, 'x18n.config.yml')
    content = `# yaml-language-server: $schema=https://x18n.antfu.dev/schema/config.json\n${stringifyYaml(config)}`
  }
  else if (format === 'json') {
    file = join(root, 'x18n.config.json')
    content = `${JSON.stringify({ $schema: 'https://x18n.antfu.dev/schema/config.json', ...config }, null, 2)}\n`
  }
  else {
    file = join(root, 'x18n.config.ts')
    const body = JSON.stringify(config, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, '\'')
    content = `import { defineConfig } from '@x18n/core'\n\n// Detected presets: ${detected.join(', ') || 'none'}. They apply automatically.\nexport default defineConfig(${body})\n`
  }
  if (!configFileNames.some(name => file.endsWith(name)))
    throw errors.X18N0001({ issue: `unknown format "${format}" (ts, yml, json)` })
  await writeFile(file, content)
  if (options.json)
    printJson('init', { file, presets: detected, config })
  else
    out(`Wrote ${file}\nDetected presets: ${detected.join(', ') || 'none'}\nLocales: ${project.locales.join(', ')}`)
}

// JSON is valid TS; only the quotes around plain keys are dropped, so regex strings stay intact.
const literal = (value: unknown): string => JSON.stringify(value, null, 2).replace(/"([a-z_$][\w$]*)":/gi, '$1:')

/** The TS plugin equivalent of a YAML plugin, using the same built-in factories. */
function ejectPlugin(data: PluginFile): string {
  const lines: string[] = []
  const configLines: string[] = []
  if (data.config)
    configLines.push(`    Object.assign(config, ${literal(data.config).replace(/\n/g, '\n    ')})`)
  if (data.scanners?.calls || data.scanners?.regex) {
    configLines.push(`    config.usage = {`, `      ...config.usage,`)
    if (data.scanners.calls)
      configLines.push(`      calls: [...config.usage.calls, ...${literal(data.scanners.calls).replace(/\n/g, '\n      ')}],`)
    if (data.scanners.regex)
      configLines.push(`      regex: [...config.usage.regex, ...${literal(data.scanners.regex).replace(/\n/g, '\n      ')}],`)
    configLines.push(`    }`)
  }
  const fields: string[] = [`  name: ${literal(data.name)},`]
  if (configLines.length)
    fields.push(`  config(config) {`, ...configLines, `  },`)
  if (data.derivedKeys)
    fields.push(`  derivedKeys: ${literal(data.derivedKeys)},`)
  if (data.placeholders)
    fields.push(`  placeholders: ${literal(data.placeholders)}.map(placeholderFromShape),`)
  if (data.normalizeKey) {
    const rules = data.normalizeKey.map(rule => `.replace(new RegExp(${literal(rule.replace.pattern)}, 'g'), ${literal(rule.replace.with)})`).join('')
    fields.push(`  normalizeKey: raw => raw${rules},`)
  }
  if (data.localeInfo)
    fields.push(`  localeInfo: code => (${literal(data.localeInfo)} as Record<string, { flag?: string, displayName?: string }>)[code],`)
  const imports = [
    'definePlugin',
    ...data.detect
      ? ['definePreset']
      : [],
  ]
  lines.push(`import { ${imports.join(', ')} } from '@x18n/core'`)
  if (data.placeholders)
    lines.push(`import { placeholderFromShape } from '@x18n/builtins/placeholders'`)
  if (data.scopes)
    lines.push(`import regexScopes from '@x18n/builtins/scanners/regex-scopes'`)
  lines.push('', `const plugin = definePlugin({`, ...fields, `})`, '')
  const plugins = `[plugin${data.scopes
    ? `, regexScopes(${literal(data.scopes.regex)})`
    : ''}]`
  if (data.detect) {
    const any = data.detect.dependencies?.any
    lines.push(`export default definePreset({`, `  name: ${literal(data.name)},`, ...data.exclusive
      ? [`  exclusive: true,`]
      : [], `  detect: ctx => ${any
      ? `ctx.hasAnyDependency(${literal(any)})`
      : 'true'},`, `  plugins: ${plugins},`, `})`)
  }
  else {
    lines.push(data.scopes
      ? `export default ${plugins}`
      : 'export default plugin')
  }
  return `${lines.join('\n')}\n`
}

export async function eject(file: string, options: GlobalOptions): Promise<void> {
  const path = resolve(cwd(), file)
  if (!existsSync(path))
    throw errors.X18N1001({ specifier: path, reason: 'the file does not exist' })
  const result = validate(PluginFileSchema, parseYaml(await readFile(path, 'utf8')))
  if (!result.success) {
    throw errors.X18N1004({
      file: path,
      issues: result.issues.map(i => `${i.path}: ${i.message}`).join('; '),
    })
  }
  const code = ejectPlugin(result.output)
  if (options.json)
    printJson('plugin eject', { file: path, code })
  else
    out(code)
}

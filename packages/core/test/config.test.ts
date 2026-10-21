import type { Format, Plugin, Preset } from '../src'
import { toJsonSchema } from '@valibot/to-json-schema'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildJsonSchema } from '../scripts/schema'
import { createMemoryHost, defineConfig, definePlugin, definePreset, isX18nError, resolveConfig } from '../src'
import { ConfigSchema, PluginFileSchema } from '../src/schema'

const format = (id: string, extensions: string[]): Format => ({ id, extensions, parse: () => ({ tree: {} }) })

describe('resolveConfig', () => {
  it('orders plugins: builtins, presets, user; pre and post by enforce', async () => {
    const preset: Preset = { name: 'lib', detect: ctx => ctx.hasDependency('lib'), plugins: [{ name: 'lib-plugin' }] }
    const setup = await resolveConfig({
      host: createMemoryHost({ 'package.json': JSON.stringify({ dependencies: { lib: '1' } }) }),
      config: { plugins: [{ name: 'user' }, { name: 'early', enforce: 'pre' }] },
      builtins: {
        plugins: [{ name: 'builtin', manifests: [{ id: 'pkg', file: 'package.json', read: text => Object.keys(JSON.parse(text).dependencies) }] }],
        presets: { lib: () => preset, other: () => ({ name: 'other', detect: () => false, plugins: [{ name: 'other-plugin' }] }) },
      },
    })
    expect(setup.registry.plugins.map(p => p.name)).toEqual(['early', 'builtin', 'lib-plugin', 'user'])
    expect(setup.presets).toEqual([{ name: 'lib', reason: 'detected' }, { name: 'other', reason: 'not-detected' }])
  })

  it('stops after an exclusive preset', async () => {
    const setup = await resolveConfig({
      host: createMemoryHost(),
      config: {},
      builtins: {
        plugins: [],
        presets: {
          a: () => ({ name: 'a', exclusive: true, detect: () => true, plugins: [] }),
          b: () => ({ name: 'b', detect: () => true, plugins: [] }),
        },
      },
    })
    expect(setup.presets.map(p => p.reason)).toEqual(['detected', 'after-exclusive'])
  })

  it('records origins: plugin defaults, then user values', async () => {
    const setup = await resolveConfig({
      host: createMemoryHost(),
      config: { sourceLocale: 'de', usage: { calls: [{ callee: 'tr' }] } },
      builtins: {
        plugins: [{
          name: 'defaults',
          config(draft) {
            draft.resources = [{ pattern: 'locales/{locale}.json' }]
            draft.usage = { ...draft.usage, calls: [{ callee: 't' }] }
          },
        }],
        presets: {},
      },
    })
    expect(setup.config.origins).toMatchObject({ resources: 'plugin:defaults', sourceLocale: 'user', usage: 'user' })
    expect(setup.config.usage.calls.map(c => c.callee)).toEqual(['t', 'tr'])
  })

  it('lets the first format claim an extension and records the loser', async () => {
    const setup = await resolveConfig({
      host: createMemoryHost(),
      config: { formats: { jsonc: 'second' } },
      builtins: { plugins: [{ name: 'a', formats: [format('first', ['json', 'jsonc'])] }, { name: 'b', formats: [format('second', ['json', 'jsonc'])] }], presets: {} },
    })
    expect(setup.registry.formatFor('x.json')?.id).toBe('first')
    expect(setup.registry.formatFor('x.jsonc')?.id).toBe('second')
    expect(setup.registry.conflicts).toContainEqual({ capability: 'format', extension: 'json', winner: 'first', loser: 'second' })
  })

  it('refuses duplicate check ids unless overridden', async () => {
    const check = { id: 'dup', defaultSeverity: 'warning' as const, run: () => [] }
    const builtins = (override: boolean) => ({ plugins: [{ name: 'a', checks: [check] }, { name: 'b', checks: [{ ...check, override }] }], presets: {} })
    await expect(resolveConfig({ host: createMemoryHost(), config: {}, builtins: builtins(false) })).rejects.toMatchObject({ code: 'X18N1002' })
    await expect(resolveConfig({ host: createMemoryHost(), config: {}, builtins: builtins(true) })).resolves.toBeTruthy()
  })

  it('rejects unknown keys with a coded error', async () => {
    const error = await resolveConfig({ host: createMemoryHost(), config: JSON.parse('{"sourceLocal":"en"}'), builtins: { plugins: [], presets: {} } }).catch(e => e)
    expect(isX18nError(error) && error.code).toBe('X18N0001')
  })

  it('inherits a parent config', async () => {
    const setup = await resolveConfig({
      host: createMemoryHost(),
      parent: { sourceLocale: 'fr', ignoreKeys: ['a'] },
      config: { ignoreKeys: ['b'] },
      builtins: { plugins: [], presets: {} },
    })
    expect(setup.config.sourceLocale).toBe('fr')
    expect(setup.config.ignoreKeys).toEqual(['a', 'b'])
  })
})

describe('schemas', () => {
  it('config schema', () => {
    expect(buildJsonSchema(ConfigSchema, 'x18n config')).toMatchSnapshot()
  })

  it('plugin schema', () => {
    expect(toJsonSchema(PluginFileSchema, { errorMode: 'ignore' })).toMatchSnapshot()
  })
})

describe('define helpers', () => {
  it('keeps literal types of plugins and presets', () => {
    const plugin = definePlugin({ name: 'acme' })
    expectTypeOf(plugin.name).toEqualTypeOf<'acme'>()
    const preset = definePreset({ name: 'acme', plugins: [definePlugin({ name: 'acme-format' })] })
    expectTypeOf(preset.plugins[0].name).toEqualTypeOf<'acme-format'>()
    const factory = definePlugin((options: { prefix: string }) => ({ name: 'acme-keys', normalizeKey: (raw: string) => raw.slice(options.prefix.length) }))
    expectTypeOf(factory).parameter(0).toEqualTypeOf<{ prefix: string }>()
    expectTypeOf(factory({ prefix: 'x' })).toExtend<Plugin>()
  })

  it('types the config', () => {
    defineConfig({ sourceLocale: 'en', checks: { 'unused-key': 'error', 'custom': ['warning', { a: 1 }] } })
    // @ts-expect-error unknown option
    defineConfig({ sourceLocal: 'en' })
    // @ts-expect-error invalid severity
    defineConfig({ checks: { 'unused-key': 'fatal' } })
  })
})

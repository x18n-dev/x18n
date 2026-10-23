import type { GenericSchema } from 'valibot'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { toJsonSchema } from '@valibot/to-json-schema'
import { ConfigSchema, PluginFileSchema } from '../src/schema'

/** Writes `schema/config.json` and `schema/plugin.json` from the valibot schemas. */
export function buildJsonSchema(schema: GenericSchema<unknown>, title: string): object {
  return {
    ...toJsonSchema(schema, {
      errorMode: 'ignore',
      overrideSchema: context => context.valibotSchema.type === 'custom'
        ? { type: 'object' }
        : undefined,
    }),
    title,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = new URL('../schema/', import.meta.url)
  await mkdir(out, { recursive: true })
  await writeFile(new URL('config.json', out), `${JSON.stringify(buildJsonSchema(ConfigSchema, 'x18n config'), null, 2)}\n`)
  await writeFile(new URL('plugin.json', out), `${JSON.stringify(buildJsonSchema(PluginFileSchema, 'x18n YAML plugin'), null, 2)}\n`)
}

import type { ConfigContext } from '@x18n/core'

export async function readNuxtConfig(host: ConfigContext['host']): Promise<string | undefined> {
  return await host.readFile('nuxt.config.ts') ?? await host.readFile('nuxt.config.js')
}

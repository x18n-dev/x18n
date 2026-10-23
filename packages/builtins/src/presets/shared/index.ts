import type { DetectContext } from '@x18n/core'

export function dependsOn(names: readonly string[], prefixes: readonly string[] = []): (ctx: DetectContext) => boolean {
  return ctx => ctx.hasAnyDependency(names) || [...ctx.dependencies].some(dep => prefixes.some(prefix => dep.startsWith(prefix)))
}

/** Extensions of JS and TS sources. */
export const scriptExtensions: readonly string[] = [
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
]

import type { ReporterLoader } from '@x18n/core'

/** Reporters by id. Each is also its own module, `@x18n/builtins/reporters/<id>`. */
export const reporters: { readonly [id: string]: ReporterLoader } = {
  pretty: () => import('./pretty'),
  json: () => import('./json'),
  markdown: () => import('./markdown'),
  github: () => import('./github'),
  sarif: () => import('./sarif'),
}

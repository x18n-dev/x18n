import type { Plugin } from '@x18n/core'
import type { JsonOptions } from '../shared/json'
import { createJsonFormat } from '../shared/json'

/** Application Resource Bundle files: JSON, where `@@locale` and `@key` entries are metadata that presets set aside. */
export function arb(options: JsonOptions = {}): Plugin {
  return {
    name: 'x18n:format-arb',
    formats: [
      createJsonFormat('arb', ['arb'], true, options.indent),
    ],
  }
}

export default arb

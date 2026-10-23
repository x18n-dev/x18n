import type { Plugin } from '@x18n/core'
import type { JsonOptions } from '../shared/json'
import { createJsonFormat } from '../shared/json'

export function jsonc(options: JsonOptions = {}): Plugin {
  return {
    name: 'x18n:format-jsonc',
    formats: [
      createJsonFormat('jsonc', ['jsonc'], true, options.indent),
    ],
  }
}

export default jsonc

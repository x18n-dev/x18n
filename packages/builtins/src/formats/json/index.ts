import type { Plugin } from '@x18n/core'
import type { JsonOptions } from '../shared/json'
import { createJsonFormat } from '../shared/json'

export type { JsonOptions }

export function json(options: JsonOptions = {}): Plugin {
  return {
    name: 'x18n:format-json',
    formats: [
      createJsonFormat('json', ['json'], true, options.indent),
    ],
  }
}

export default json

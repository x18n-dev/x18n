import type { Plugin } from '@x18n/core'
import { errors, isMessageTree } from '@x18n/core'
import JSON5 from 'json5'

export function json5(): Plugin {
  return {
    name: 'x18n:format-json5',
    formats: [
      {
        id: 'json5',
        extensions: ['json5'],
        parse(text, ctx) {
          if (text.trim() === '')
            return { tree: {} }
          let data: unknown
          try {
            data = JSON5.parse(text)
          }
          catch (error) {
            throw errors.X18N2002({
              path: ctx.path,
              reason: error instanceof Error
                ? error.message
                : String(error),
              cause: error,
            })
          }
          if (!isMessageTree(data))
            throw errors.X18N2003({ path: ctx.path })
          return { tree: data }
        },
        serialize: (tree, ctx) => `${JSON5.stringify(tree, null, ctx.indent === 'tab'
          ? '\t'
          : ctx.indent ?? 2)}\n`,
      },
    ],
  }
}

export default json5

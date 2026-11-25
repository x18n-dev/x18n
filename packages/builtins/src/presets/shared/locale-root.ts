import type { MessageTree, ResourceTransform } from '@x18n/core'
import { isMessageObject } from '@x18n/core'

/** Files that start with their locale, `en: { users: ... }`, as in Rails and i18nice. */
export function localeRoot(applies: ResourceTransform['applies']): ResourceTransform {
  return {
    applies,
    read(tree, ctx) {
      const root = tree[ctx.locale]
      return root !== undefined && isMessageObject(root)
        ? root
        : {} satisfies MessageTree
    },
    toStored: (path, ctx) => [ctx.locale, ...path],
  }
}

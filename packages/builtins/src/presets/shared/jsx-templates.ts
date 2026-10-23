import type { ExtractTemplate } from '@x18n/core'

export const jsxTemplates: readonly ExtractTemplate[] = [
  {
    template: '{t(\'{key}\'{args})}',
    kinds: ['jsx-text'],
  },
  {
    template: '{attr}={t(\'{key}\'{args})}',
    kinds: ['jsx-attribute'],
  },
  {
    template: 't(\'{key}\'{args})',
    kinds: ['js-string', 'js-template'],
  },
]

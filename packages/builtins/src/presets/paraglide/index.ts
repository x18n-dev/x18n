import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'
import { scriptExtensions } from '../shared'

export function paraglide(): Preset {
  return {
    name: 'paraglide',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:paraglide',
        // Messages are functions: `m.hello_world({ name })` or `m['hello.world']()`.
        regex: [
          {
            extensions: [
              ...scriptExtensions,
              'vue',
              'svelte',
              'astro',
            ],
            patterns: ['\\bm\\.({key})\\(', '\\bm\\[\\s*[\'"`]({key})[\'"`]\\s*\\]\\('],
          },
        ],
        resources: [
          { pattern: 'messages/{locale}.json' },
        ],
        templates: [
          {
            template: '{m.{key}({args})}',
            kinds: ['jsx-text', 'svelte-text'],
            imports: ['import { m } from \'$lib/paraglide/messages\''],
          },
          {
            template: 'm.{key}({args})',
            kinds: ['js-string', 'js-template'],
            imports: ['import { m } from \'$lib/paraglide/messages\''],
          },
        ],
        placeholders: [braces],
      }),
    ],
  }
}

export default paraglide

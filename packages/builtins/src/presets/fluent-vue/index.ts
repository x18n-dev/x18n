import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { sfcFluentBlocks } from '../../finders/sfc-blocks'
import { fluent } from '../../placeholders'

export function fluentVue(): Preset {
  return {
    name: 'fluent-vue',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:fluent-vue',
        calls: [
          {
            callee: [
              '$t',
              '$ta',
              'fluent.format',
              'fluent.formatAttrs',
              'this.$t',
              'this.$ta',
            ],
          },
          {
            callee: 'useFluent',
            factory: true,
            returns: ['$t', '$ta', 'format', 'formatAttrs'],
          },
        ],
        regex: [
          {
            extensions: ['vue'],
            patterns: ['v-t:({key})[\\s\\n=>]', '<i18n[\\s\\n]+path=[\'"`]({key})[\'"`]'],
          },
        ],
        resources: [
          { pattern: 'locales/{locale}.ftl' },
          { pattern: 'src/locales/{locale}.ftl' },
        ],
        templates: [
          {
            template: '{{ $t(\'{key}\'{args}) }}',
            kinds: ['vue-template-text'],
          },
          {
            template: ':{attr}="$t(\'{key}\'{args})"',
            kinds: ['vue-attribute'],
          },
          {
            template: '$t(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [fluent],
      }),
      sfcFluentBlocks(),
    ],
  }
}

export default fluentVue

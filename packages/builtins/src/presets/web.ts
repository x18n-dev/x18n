// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { MessageTree, Preset } from '@x18n/core'
import { isMessageLeaf } from '@x18n/core'
import { sfcFluentBlocks } from '../finders/sfc-blocks'
import { braces, dollars, doubleBraces, fluent, icu, percentBraces, placeholders } from '../placeholders'
import { reactI18next } from './js'
import { dependsOn, library, scriptExtensions } from './shared'

const jsxTemplates = [
  { template: '{t(\'{key}\'{args})}', kinds: ['jsx-text'] },
  { template: '{attr}={t(\'{key}\'{args})}', kinds: ['jsx-attribute'] },
  { template: 't(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
]

export function nextInternational(): Preset {
  return {
    name: 'next-international',
    detect: dependsOn(['next-international']),
    plugins: [
      library({
        name: 'next-international',
        calls: [
          { callee: ['useI18n', 'getI18n'], factory: true, returns: ['t'] },
          { callee: ['useScopedI18n', 'getScopedI18n'], factory: true, returns: ['t'], keyPrefix: { arg: 0 } },
        ],
        resources: [{ pattern: 'locales/{locale}.{ext}' }, { pattern: 'src/locales/{locale}.{ext}' }],
        templates: jsxTemplates,
      }),
      placeholders(braces),
    ],
  }
}

export function nextTranslate(): Preset {
  return {
    name: 'next-translate',
    detect: dependsOn(['next-translate']),
    plugins: [
      library({
        name: 'next-translate',
        namespace: { separator: ':', default: 'common' },
        calls: [
          { callee: 'useTranslation', factory: true, returns: ['t'], namespace: { arg: 0 } },
          { callee: 'getT', factory: true, returns: ['t'], namespace: { arg: 1 } },
          { callee: 'Trans', key: { arg: 0, property: 'i18nKey' }, namespace: { arg: 0, property: 'ns' } },
          { callee: 't' },
        ],
        regex: [{ extensions: scriptExtensions, patterns: ['[^\\w\\d]t`({key})`'] }],
        resources: [{ pattern: 'locales/{locale}/{namespace}.json' }],
        keyStyle: 'nested',
        templates: jsxTemplates,
      }),
      placeholders(doubleBraces),
    ],
  }
}

/** Shopify's i18next format: plural and ordinal forms as nested keys (`{key}.one`). */
export function i18nextShopify(): Preset {
  // Each locale needs its own plural categories; exact counts (`{key}.0`) are plain keys.
  const derivedKeys = ['{key}.ordinal.{ordinal}', '{key}.{plural}', ...['plural', ...Array.from({ length: 10 }, (_, i) => String(i))].map(form => `{key}.${form}`)]
  return {
    name: 'i18next-shopify',
    detect: dependsOn(['@shopify/i18next-shopify']),
    plugins: [
      ...reactI18next().plugins,
      library({ name: 'i18next-shopify', derivedKeys, keyStyle: 'nested' }),
      placeholders(braces),
    ],
  }
}

export function i18nTag(): Preset {
  return {
    name: 'i18n-tag',
    detect: dependsOn(['es2015-i18n-tag']),
    plugins: [library({
      name: 'i18n-tag',
      regex: [{ extensions: [...scriptExtensions, 'vue'], patterns: ['i18n`({key})`'] }],
      templates: [{ template: 'i18n`{key}`', kinds: ['js-string', 'js-template'] }],
    })],
  }
}

export function fluentVue(): Preset {
  return {
    name: 'fluent-vue',
    detect: dependsOn(['fluent-vue', 'fluent-vue-loader', 'rollup-plugin-fluent-vue', 'unplugin-fluent-vue']),
    plugins: [
      library({
        name: 'fluent-vue',
        calls: [
          { callee: ['$t', '$ta', 'fluent.format', 'fluent.formatAttrs', 'this.$t', 'this.$ta'] },
          { callee: 'useFluent', factory: true, returns: ['$t', '$ta', 'format', 'formatAttrs'] },
        ],
        regex: [{ extensions: ['vue'], patterns: ['v-t:({key})[\\s\\n=>]', '<i18n[\\s\\n]+path=[\'"`]({key})[\'"`]'] }],
        resources: [{ pattern: 'locales/{locale}.ftl' }, { pattern: 'src/locales/{locale}.ftl' }],
        templates: [
          { template: '{{ $t(\'{key}\'{args}) }}', kinds: ['vue-template-text'] },
          { template: ':{attr}="$t(\'{key}\'{args})"', kinds: ['vue-attribute'] },
          { template: '$t(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      sfcFluentBlocks(),
      placeholders(fluent),
    ],
  }
}

export function polyglot(): Preset {
  return {
    name: 'polyglot',
    detect: dependsOn(['node-polyglot']),
    plugins: [
      library({
        name: 'polyglot',
        calls: [{ callee: ['polyglot.t', 'I18n.t'] }],
        regex: [{ extensions: ['rb'], patterns: ['(?:polyglot|I18n)\\.t\\(\\s*[\'"`]({key})[\'"`]'] }],
        templates: [{ template: 'polyglot.t(\'{key}\'{args})', kinds: ['js-string', 'js-template'] }],
      }),
      placeholders(percentBraces),
    ],
  }
}

export function globalize(): Preset {
  return {
    name: 'globalize',
    detect: dependsOn(['globalize']),
    plugins: [
      library({
        name: 'globalize',
        calls: [{ callee: ['Globalize.messageFormatter', 'Globalize.formatMessage', 'globalize.messageFormatter', 'globalize.formatMessage'] }],
        // Globalize paths use `/` (`greetings/hello`).
        normalizeKey: raw => raw.includes('/') ? raw.replace(/\//g, '.') : undefined,
        templates: [{ template: 'Globalize.formatMessage(\'{key}\'{args})', kinds: ['js-string', 'js-template'] }],
      }),
      placeholders(icu),
    ],
  }
}

export function ui5(): Preset {
  return {
    name: 'ui5',
    detect: dependsOn(['@ui5/cli']),
    plugins: [
      library({
        name: 'ui5',
        regex: [
          { extensions: ['xml', 'json', ...scriptExtensions], patterns: ['\\{i18n>({key})\\}'] },
          { extensions: scriptExtensions, patterns: ['getResourceBundle\\(\\)\\.getText\\(\\s*[\'"`]({key})[\'"`]'] },
        ],
        resources: [{ pattern: 'webapp/i18n/i18n_{locale}.properties' }, { pattern: 'webapp/i18n/i18n.properties' }],
        keyStyle: 'flat',
        templates: [
          { template: '{i18n>{key}}', files: ['**/*.xml'] },
          { template: 'this.getResourceBundle().getText(\'{key}\')', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(braces),
    ],
  }
}

export function lingui(): Preset {
  return {
    name: 'lingui',
    detect: dependsOn(['@lingui/core', '@lingui/react', '@lingui/macro']),
    plugins: [
      library({
        name: 'lingui',
        calls: [
          { callee: ['i18n._', 'i18n.t', 't', '_'] },
          { callee: ['t', 'msg', 'defineMessage', 'i18n._', 'Trans'], key: { arg: 0, property: 'id' } },
          { callee: 'useLingui', factory: true, returns: ['t', '_'] },
        ],
        regex: [{ extensions: scriptExtensions, patterns: ['\\bt`({key})`', '<Trans>[\\s]*({key})[\\s]*<\\/Trans>'] }],
        resources: [{ pattern: 'src/locales/{locale}/messages.po' }, { pattern: 'locales/{locale}/messages.po' }],
        // Lingui keys are source messages.
        extra: (draft) => {
          draft.extract = { keygen: 'source', ...draft.extract }
        },
        templates: [
          { template: '<Trans>{key}</Trans>', kinds: ['jsx-text'], imports: ['import { Trans } from \'@lingui/react/macro\''] },
          { template: 't`{key}`', kinds: ['js-string', 'js-template'], imports: ['import { t } from \'@lingui/core/macro\''] },
        ],
      }),
      placeholders(icu),
    ],
  }
}

export function emberIntl(): Preset {
  return {
    name: 'ember-intl',
    detect: dependsOn(['ember-intl']),
    plugins: [
      library({
        name: 'ember-intl',
        calls: [{ callee: ['intl.t'] }],
        regex: [{ extensions: ['hbs', 'gjs', 'gts'], patterns: ['\\{\\{\\s*t\\s+[\'"`]({key})[\'"`]', '\\(\\s*t\\s+[\'"`]({key})[\'"`]'] }],
        resources: [{ pattern: 'translations/{locale}.{ext}' }, { pattern: 'translations/{namespaces}/{locale}.{ext}' }],
        templates: [
          { template: '{{t \'{key}\'}}', files: ['**/*.hbs'] },
          { template: 'this.intl.t(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(icu),
    ],
  }
}

export function i18nJs(): Preset {
  return {
    name: 'i18n-js',
    detect: dependsOn(['i18n-js']),
    plugins: [
      library({
        name: 'i18n-js',
        calls: [{ callee: ['I18n.t', 'i18n.t'] }],
        templates: [{ template: 'i18n.t(\'{key}\'{args})', kinds: ['js-string', 'js-template'] }],
      }),
      placeholders(percentBraces),
    ],
  }
}

/** Chrome and WebExtension `_locales/{locale}/messages.json`: `{ "name": { "message": "..." } }` reads as `name`. */
export function chromeExtension(): Preset {
  return {
    name: 'chrome-extension',
    async detect(ctx) {
      for (const path of ['manifest.json', 'src/manifest.json', 'public/manifest.json']) {
        if ((await ctx.host.readFile(path))?.includes('"default_locale"'))
          return true
      }
      return false
    },
    plugins: [
      library({
        name: 'chrome-extension',
        calls: [{ callee: ['chrome.i18n.getMessage', 'browser.i18n.getMessage', 'i18n.getMessage'] }],
        regex: [{ extensions: ['json', 'html', 'css'], patterns: ['__MSG_({key})__'] }],
        resources: [{ pattern: '_locales/{locale}/messages.json' }, { pattern: '{src,public,extension}/_locales/{locale}/messages.json' }],
        transformResource: {
          applies: ctx => /(?:^|\/)_locales\/[^/]+\/messages\.json$/.test(ctx.path),
          read(tree) {
            const out: Record<string, MessageTree[string]> = {}
            for (const [name, entry] of Object.entries(tree)) {
              const message = isMessageLeaf(entry) ? undefined : entry.message
              if (message !== undefined && isMessageLeaf(message))
                out[name] = message
            }
            return out
          },
          toStored: path => [path.join('.'), 'message'],
        },
        templates: [{ template: 'chrome.i18n.getMessage(\'{key}\')', kinds: ['js-string', 'js-template'] }],
      }),
      {
        name: 'x18n:chrome-extension-source-locale',
        async config(draft, ctx) {
          const manifest = await ctx.host.readFile('manifest.json') ?? await ctx.host.readFile('src/manifest.json') ?? await ctx.host.readFile('public/manifest.json')
          const locale = manifest ? /"default_locale"\s*:\s*"([^"]+)"/.exec(manifest)?.[1] : undefined
          if (locale)
            draft.sourceLocale = locale
        },
      },
      placeholders(dollars),
    ],
  }
}

export function solidPrimitivesI18n(): Preset {
  return {
    name: 'solid-primitives-i18n',
    detect: dependsOn(['@solid-primitives/i18n']),
    plugins: [
      library({
        name: 'solid-primitives-i18n',
        calls: [{ callee: ['t', 'i18n.t'] }],
        templates: [
          { template: '{t(\'{key}\'{args})}', kinds: ['jsx-text'] },
          { template: '{attr}={t(\'{key}\'{args})}', kinds: ['jsx-attribute'] },
          { template: 't(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(doubleBraces),
    ],
  }
}

export function paraglide(): Preset {
  return {
    name: 'paraglide',
    detect: dependsOn(['@inlang/paraglide-js', '@inlang/paraglide-sveltekit', '@inlang/paraglide-next', '@inlang/paraglide-astro', '@inlang/paraglide-vite']),
    plugins: [
      library({
        name: 'paraglide',
        // Messages are functions: `m.hello_world({ name })` or `m['hello.world']()`.
        regex: [{ extensions: [...scriptExtensions, 'vue', 'svelte', 'astro'], patterns: ['\\bm\\.({key})\\(', '\\bm\\[\\s*[\'"`]({key})[\'"`]\\s*\\]\\('] }],
        resources: [{ pattern: 'messages/{locale}.json' }],
        templates: [
          { template: '{m.{key}({args})}', kinds: ['jsx-text', 'svelte-text'], imports: ['import { m } from \'$lib/paraglide/messages\''] },
          { template: 'm.{key}({args})', kinds: ['js-string', 'js-template'], imports: ['import { m } from \'$lib/paraglide/messages\''] },
        ],
      }),
      placeholders(braces),
    ],
  }
}

// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import type { CallSpec, ConfigContext, Preset } from '@x18n/core'
import { defaultTemplates } from '../extractors'
import { sfcBlocks } from '../finders/sfc-blocks'
import { braces, doubleBraces, icu, linked, nesting, placeholders } from '../placeholders'
import { nlsFinder } from './nls'
import { dependsOn, library } from './shared'

const vueI18nCalls: CallSpec[] = [
  { callee: ['$t', 't', 'tc', '$tc', 'te', '$te', 'tm', '$tm', 'i18n.t', 'i18n.global.t', '$i18n.t', 'i18n.tc', 'i18n.te'] },
  { callee: 'useI18n', factory: true, returns: ['t', 'tc', 'te', 'tm'] },
]

export function vueI18n(): Preset {
  return {
    name: 'vue-i18n',
    detect: dependsOn(['vue-i18n', 'vuex-i18n', 'petite-vue-i18n', 'vue-i18n-bridge'], ['@intlify/']),
    plugins: [
      library({
        name: 'vue-i18n',
        calls: vueI18nCalls,
        templates: [
          { template: '{{ $t(\'{key}\'{args}) }}', kinds: ['vue-template-text'] },
          { template: ':{attr}="$t(\'{key}\'{args})"', kinds: ['vue-attribute'] },
          { template: 't(\'{key}\'{args})', kinds: ['js-string', 'js-template'], files: ['**/*.vue'], imports: ['import { useI18n } from \'vue-i18n\'', 'const { t } = useI18n()'] },
        ],
      }),
      // vue-i18n passes `n` and `count` to plural messages.
      placeholders({ ...braces, implicit: ['n', 'count'] }, linked),
      sfcBlocks(),
    ],
  }
}

export function nuxtI18n(): Preset {
  return {
    name: 'nuxt-i18n',
    detect: dependsOn(['@nuxtjs/i18n', 'nuxt-i18n']),
    plugins: [
      ...vueI18n().plugins,
      {
        name: 'x18n:nuxt-i18n',
        async config(draft, ctx) {
          const nuxtConfig = await ctx.host.readFile('nuxt.config.ts') ?? await ctx.host.readFile('nuxt.config.js')
          const langDir = nuxtConfig ? /langDir:\s*['"]([^'"]+)['"]/.exec(nuxtConfig)?.[1]?.replace(/^\.\/|\/$/g, '') : undefined
          const dirs = langDir ? [`i18n/${langDir}`, langDir] : ['i18n/locales', 'locales', 'lang']
          draft.resources = [...draft.resources, ...dirs.map(dir => ({ pattern: `${dir}/{locale}.{ext}` }))]
        },
      },
    ],
  }
}

/** `defaultNS` from the i18next init code (`i18n.ts`, `next-i18next.config.js`), as keys without a namespace use it. */
async function findDefaultNamespace(host: ConfigContext['host']): Promise<string | undefined> {
  const files = await host.glob(['**/*i18n*.{js,mjs,cjs,ts,mts,cts}', '**/i18n/index.{js,ts}'], { ignore: ['**/node_modules/**', '**/dist/**'], gitignore: true })
  for (const file of files.slice(0, 20)) {
    const found = /\bdefaultNS\s*:\s*['"`]([^'"`]+)['"`]/.exec(await host.readFile(file) ?? '')
    if (found)
      return found[1]
  }
  return undefined
}

const i18nextPlugin = library({
  name: 'i18next',
  // i18next names a namespace in a folder by its path: `useTranslation('pages/home')`.
  namespace: { separator: ':', default: 'translation', fromPath: 'slash' },
  extra: async (draft, ctx) => {
    const found = ctx.user.namespace?.default ? undefined : await findDefaultNamespace(ctx.host)
    if (found)
      draft.namespace = { ...draft.namespace, default: found }
  },
  calls: [
    { callee: ['t', 'i18next.t', 'i18n.t'], namespace: { arg: 1, property: 'ns' } },
    { callee: ['getFixedT', 'i18next.getFixedT', 'i18n.getFixedT'], factory: true, returns: ['t'], namespace: { arg: 1 }, keyPrefix: { arg: 2 } },
    { callee: 'tr', types: ['TFunction'] },
  ],
  derivedKeys: ['{key}_*'],
  translatePrompt: (draft, ctx) => {
    draft.notes.push(`i18next plural keys end in _${ctx.localeInfo.pluralCategories.join(', _')} for ${ctx.targetLocale}; write one key per category.`)
  },
  templates: [
    { template: 'i18next.t(\'{key}\'{args})', kinds: ['js-string', 'js-template'], imports: ['import i18next from \'i18next\''] },
  ],
})

export function i18next(): Preset {
  return {
    name: 'i18next',
    detect: dependsOn(['i18next']),
    plugins: [i18nextPlugin, placeholders(doubleBraces, nesting)],
  }
}

export function reactI18next(): Preset {
  return {
    name: 'react-i18next',
    detect: dependsOn(['react-i18next', 'next-i18next']),
    plugins: [
      i18nextPlugin,
      placeholders(doubleBraces, nesting),
      library({
        name: 'react-i18next',
        calls: [
          { callee: 'useTranslation', factory: true, returns: ['t'], namespace: { arg: 0 }, keyPrefix: { arg: 1, property: 'keyPrefix' } },
          { callee: 'Trans', key: { arg: 0, property: 'i18nKey' }, namespace: { arg: 0, property: 'ns' } },
          { callee: 'Translation', factory: true, returns: ['t'], namespace: { arg: 0, property: 'ns' } },
        ],
        templates: [
          { template: '<Trans i18nKey="{key}" />', kinds: ['jsx-text'], imports: ['import { Trans } from \'react-i18next\''] },
          { template: '{attr}={i18next.t(\'{key}\'{args})}', kinds: ['jsx-attribute'], imports: ['import i18next from \'i18next\''] },
        ],
      }),
    ],
  }
}

export function nextIntl(): Preset {
  return {
    name: 'next-intl',
    detect: dependsOn(['next-intl', 'use-intl']),
    plugins: [
      library({
        name: 'next-intl',
        calls: [
          { callee: ['useTranslations', 'getTranslations'], factory: true, returns: ['t', 't.rich', 't.markup', 't.raw', 't.has'], keyPrefix: { arg: 0 } },
          { callee: 'getTranslations', factory: true, returns: ['t', 't.rich', 't.markup', 't.raw', 't.has'], keyPrefix: { arg: 0, property: 'namespace' } },
        ],
        resources: [{ pattern: 'messages/{locale}.json' }, { pattern: 'src/messages/{locale}.json' }],
        templates: [
          { template: '{t(\'{key}\'{args})}', kinds: ['jsx-text'] },
          { template: '{attr}={t(\'{key}\'{args})}', kinds: ['jsx-attribute'] },
          { template: 't(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(icu),
    ],
  }
}

export function reactIntl(): Preset {
  return {
    name: 'react-intl',
    detect: dependsOn(['react-intl'], ['@formatjs/']),
    plugins: [
      library({
        name: 'react-intl',
        calls: [
          { callee: ['intl.formatMessage', 'formatMessage', 'defineMessage', 'FormattedMessage'], key: { arg: 0, property: 'id' } },
          { callee: 'defineMessages', key: { arg: 0, property: '*.id' } },
        ],
        templates: [
          { template: '<FormattedMessage id="{key}" />', kinds: ['jsx-text'], imports: ['import { FormattedMessage } from \'react-intl\''] },
          { template: '{attr}={intl.formatMessage({ id: \'{key}\' }{args})}', kinds: ['jsx-attribute'] },
          { template: 'intl.formatMessage({ id: \'{key}\' }{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(icu),
    ],
  }
}

export function svelteI18n(): Preset {
  return {
    name: 'svelte-i18n',
    detect: dependsOn(['svelte-i18n', 'sveltekit-i18n', '@sveltekit-i18n/base']),
    plugins: [
      library({
        name: 'svelte-i18n',
        calls: [{ callee: ['$_', '$t', '$format', '_', 't', 'format', '$json', 'json'] }],
        templates: [
          { template: '{$_(\'{key}\'{args})}', kinds: ['svelte-text'], imports: ['import { _ } from \'svelte-i18n\''] },
          { template: '{attr}={$_(\'{key}\'{args})}', kinds: ['svelte-attribute'], imports: ['import { _ } from \'svelte-i18n\''] },
        ],
      }),
      placeholders(icu),
    ],
  }
}

export function vscodeExtension(): Preset {
  return {
    name: 'vscode-extension',
    detect: ctx => ctx.hasAnyDependency(['vscode', '@types/vscode']),
    plugins: [
      library({
        name: 'vscode-extension',
        calls: [{ callee: ['l10n.t', 'vscode.l10n.t'] }],
        finders: [nlsFinder],
        extra: (draft) => {
          draft.usage = {
            ...draft.usage,
            regex: [...draft.usage.regex, { extensions: ['json'], patterns: ['"%({key})%"'] }],
          }
        },
      }),
      placeholders(braces),
    ],
  }
}

/** Always last: hard-string extraction templates for plain JS, TS and HTML. */
export function general(): Preset {
  return {
    name: 'general',
    detect: () => true,
    plugins: [{
      name: 'x18n:general',
      extractors: [{ id: 'general', templates: defaultTemplates }],
    }],
  }
}

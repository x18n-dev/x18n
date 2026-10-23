import type { PresetFactory } from '@x18n/core'
import { ngxTranslate, transloco } from './angular'
import { general, i18next, nextIntl, nuxtI18n, reactI18next, reactIntl, svelteI18n, vscodeExtension, vueI18n } from './js'
import { flutter } from './mobile'
import { i18nice, pythonGettext } from './python'
import { jekyll, laravel, phpGettext, phpJoomla, rubyRails } from './server'
import { chromeExtension, emberIntl, fluentVue, globalize, i18nextShopify, i18nJs, i18nTag, lingui, nextInternational, nextTranslate, paraglide, polyglot, solidPrimitivesI18n, ui5 } from './web'

export { ngxTranslate, transloco } from './angular'
export { general, i18next, nextIntl, nuxtI18n, reactI18next, reactIntl, svelteI18n, vscodeExtension, vueI18n } from './js'
export { flutter } from './mobile'
export { i18nice, pythonGettext } from './python'
export { jekyll, laravel, phpGettext, phpJoomla, railsLazyKey, rubyRails } from './server'
export { chromeExtension, emberIntl, fluentVue, globalize, i18nextShopify, i18nJs, i18nTag, lingui, nextInternational, nextTranslate, paraglide, polyglot, solidPrimitivesI18n, ui5 } from './web'

/**
 * Presets by name, in detection order: every i18n-ally framework has one.
 * Presets that share plugins (react-i18next and i18next) apply them once.
 */
export const presets: { readonly [name: string]: PresetFactory } = {
  'nuxt-i18n': () => nuxtI18n(),
  'vue-i18n': () => vueI18n(),
  'fluent-vue': () => fluentVue(),
  'i18next-shopify': () => i18nextShopify(),
  'react-i18next': () => reactI18next(),
  'next-translate': () => nextTranslate(),
  'next-international': () => nextInternational(),
  'i18next': () => i18next(),
  'next-intl': () => nextIntl(),
  'react-intl': () => reactIntl(),
  'svelte-i18n': () => svelteI18n(),
  'solid-primitives-i18n': () => solidPrimitivesI18n(),
  'paraglide': () => paraglide(),
  'ngx-translate': () => ngxTranslate(),
  'transloco': () => transloco(),
  'lingui': () => lingui(),
  'ember-intl': () => emberIntl(),
  'polyglot': () => polyglot(),
  'globalize': () => globalize(),
  'i18n-tag': () => i18nTag(),
  'i18n-js': () => i18nJs(),
  'ui5': () => ui5(),
  'chrome-extension': () => chromeExtension(),
  'vscode-extension': () => vscodeExtension(),
  'laravel': () => laravel(),
  'php-joomla': () => phpJoomla(),
  'php-gettext': () => phpGettext(),
  'ruby-rails': () => rubyRails(),
  'jekyll': () => jekyll(),
  'flutter': () => flutter(),
  'python-gettext': () => pythonGettext(),
  'i18nice': () => i18nice(),
  'general': () => general(),
}

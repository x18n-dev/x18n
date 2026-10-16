import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import de from './locales/de.json'
import en from './locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en, de } })

createApp(App).use(i18n).mount('#app')

export function reportError(error: unknown) {
  console.error(error)
  return i18n.global.t(error instanceof TypeError ? 'errors.network' : 'errors.unknown')
}

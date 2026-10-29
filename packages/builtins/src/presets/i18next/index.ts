import type { Preset } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { i18nextCliPlugin } from './cli-config'
import { i18nextPlugin } from './plugin'

export function i18next(): Preset {
  return {
    name: 'i18next',
    plugins: [i18nextPlugin, i18nextCliPlugin],
  }
}

export default i18next

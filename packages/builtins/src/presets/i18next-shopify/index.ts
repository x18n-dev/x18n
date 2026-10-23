import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'
import { reactI18next } from '../react-i18next'

/** Shopify's i18next format: plural and ordinal forms as nested keys (`{key}.one`). */
export function i18nextShopify(): Preset {
  // Each locale needs its own plural categories; exact counts (`{key}.0`) are plain keys.
  const derivedKeys = [
    '{key}.ordinal.{ordinal}',
    '{key}.{plural}',
    ...[
      'plural',
      ...Array.from({ length: 10 }, (_, i) => String(i)),
    ].map(form => `{key}.${form}`),
  ]
  return {
    name: 'i18next-shopify',
    plugins: [
      ...reactI18next().plugins,
      createLibraryPlugin({
        name: 'x18n:i18next-shopify',
        derivedKeys,
        keyStyle: 'nested',
        placeholders: [braces],
      }),
    ],
  }
}

export default i18nextShopify

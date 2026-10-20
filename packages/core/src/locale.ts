import type { LocaleCode, LocaleInfo } from './types/model'

// Region used for the flag when a code has none. Display data only.
const defaultRegions: Readonly<Record<string, string>> = {
  ar: 'SA',
  cs: 'CZ',
  da: 'DK',
  de: 'DE',
  el: 'GR',
  en: 'US',
  es: 'ES',
  fa: 'IR',
  fi: 'FI',
  fr: 'FR',
  he: 'IL',
  hi: 'IN',
  hu: 'HU',
  id: 'ID',
  it: 'IT',
  ja: 'JP',
  ko: 'KR',
  nb: 'NO',
  nl: 'NL',
  pl: 'PL',
  pt: 'PT',
  ro: 'RO',
  ru: 'RU',
  sv: 'SE',
  th: 'TH',
  tr: 'TR',
  uk: 'UA',
  vi: 'VN',
  zh: 'CN',
}

const pluralOrder: readonly Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other']

function flagOf(region: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(region))
    return undefined
  return String.fromCodePoint(...[...region].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}

/** Lenient display parse of a locale code (`zh_CN`, `pt-BR`, `sr-Latn-RS`). Never changes the code. */
export function parseLocaleInfo(code: LocaleCode): LocaleInfo {
  const parts = code.replace(/_/g, '-').split('-').filter(Boolean)
  const language = parts[0] && /^[a-z]{2,3}$/i.test(parts[0]) ? parts[0].toLowerCase() : undefined
  let script: string | undefined
  let region: string | undefined
  for (const part of parts.slice(1)) {
    if (!script && !region && /^[a-z]{4}$/i.test(part))
      script = part[0]!.toUpperCase() + part.slice(1).toLowerCase()
    else if (!region && /^(?:[a-z]{2}|\d{3})$/i.test(part))
      region = part.toUpperCase()
  }
  const tag = [language, script, region].filter(Boolean).join('-')
  const displayName = language ? safe(() => new Intl.DisplayNames(['en'], { type: 'language' }).of(tag)) : undefined
  // CLDR order; Node versions disagree on the order `resolvedOptions` returns.
  const found = language ? safe(() => new Intl.PluralRules(tag).resolvedOptions().pluralCategories) : undefined
  const pluralCategories = found ? pluralOrder.filter(category => found.includes(category)) : ['other' as const]
  // Traditional Chinese is written mostly in Taiwan, Hong Kong and Macau; a bare `zh-Hant` is not China's.
  const flagRegion = region ?? (language === 'zh' && script === 'Hant' ? 'TW' : language ? defaultRegions[language] : undefined)
  return {
    code,
    language,
    region,
    displayName,
    flag: flagRegion ? flagOf(flagRegion) : undefined,
    pluralCategories,
  }
}

/** Codes that differ only in spelling (`zh_CN` and `zh-cn`), the same after a lenient normalization. */
export function localeSpellingKey(code: LocaleCode): string {
  return code.replace(/_/g, '-').toLowerCase()
}

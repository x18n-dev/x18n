import type { IconifyJSON } from '@iconify-json/circle-flags'
import type { RemovableRef } from '@vueuse/core'
import { useLocalStorage } from '@vueuse/core'
import { shallowRef, watchEffect } from 'vue'

export const showFlags: RemovableRef<boolean> = useLocalStorage('x18n:flags', true)

// Locale codes are only known at runtime, so the flags cannot be UnoCSS classes; the set loads on first use.
const flags = shallowRef<IconifyJSON>()
watchEffect(() => {
  if (showFlags.value && !flags.value)
    void import('@iconify-json/circle-flags').then(m => flags.value = m.icons)
})

/** The region of a flag emoji (`🇩🇪` is `DE`), as core writes `LocaleSummary.flag`. */
function regionOfFlag(flag: string): string {
  return [...flag].map(c => String.fromCharCode(c.codePointAt(0)! - 0x1F1E6 + 65)).join('')
}

/**
 * Icon names to try for a locale, best first: the flag of its region, then the icon of its language
 * (`es-419` has no country, `eo` has no region), then the neutral `xx`, so every locale shows an icon.
 * `coreFlag` is the emoji flag core wrote for the locale, if any.
 */
export function flagCandidates(tag: string, coreFlag?: string): string[] {
  const code = tag.replace(/_/g, '-').toLowerCase()
  let region: string | undefined
  try {
    region = new Intl.Locale(tag.replace(/_/g, '-')).maximize().region
  }
  catch {}
  const names = [
    ...coreFlag
      ? [
          regionOfFlag(coreFlag),
        ]
      : [],
    // `001` and `419` are world regions, not countries.
    ...region && /^[A-Z]{2}$/.test(region)
      ? [region]
      : [],
    `lang-${code}`,
    `lang-${code.split('-')[0]}`,
    'xx',
  ].map(name => name.toLowerCase())
  return [
    ...new Set(names),
  ]
}

/** A data URL of the first known icon of `names`, or undefined while the set loads. */
export function flagSource(names: readonly string[]): string | undefined {
  const set = flags.value
  if (!set)
    return undefined
  const body = names.map(name => set.icons[set.aliases?.[name]?.parent ?? name]?.body).find(Boolean)
  if (!body)
    return undefined
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${set.width ?? 512} ${set.height ?? 512}">${body}</svg>`)}`
}

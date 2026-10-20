import type { IconifyJSON } from '@iconify-json/circle-flags'
import { useLocalStorage } from '@vueuse/core'
import { shallowRef, watchEffect } from 'vue'

export const showFlags = useLocalStorage('x18n:flags', true)

// Locale codes are only known at runtime, so the flags cannot be UnoCSS classes; the set loads on first use.
const flags = shallowRef<IconifyJSON>()
watchEffect(() => {
  if (showFlags.value && !flags.value)
    void import('@iconify-json/circle-flags').then(m => flags.value = m.icons)
})

/** The region of a flag emoji (`🇩🇪` is `DE`), as core writes `LocaleSummary.flag`. */
export function regionOfFlag(flag: string): string {
  return [...flag].map(c => String.fromCharCode(c.codePointAt(0)! - 0x1F1E6 + 65)).join('')
}

/** A data URL of the round flag of a region, or undefined while loading or for an unknown region. */
export function flagSource(region: string): string | undefined {
  const set = flags.value
  if (!set)
    return undefined
  const name = region.toLowerCase()
  const body = set.icons[set.aliases?.[name]?.parent ?? name]?.body
  if (!body)
    return undefined
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${set.width ?? 512} ${set.height ?? 512}">${body}</svg>`)}`
}

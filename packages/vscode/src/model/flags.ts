import type { IconifyJSON } from '@iconify-json/circle-flags'

/** The region of a flag emoji (`🇩🇪` is `DE`), as core writes `localeInfo().flag`. */
function regionOf(flag: string): string {
  return [...flag].map(c => String.fromCharCode(c.codePointAt(0)! - 0x1F1E6 + 65)).join('')
}

/**
 * circle-flags icon names for a locale, best first: the region of its core flag, then the icon of its
 * language (`es-419` and `eo` have no country), then the neutral `xx`.
 */
export function flagNames(code: string, flag: string | undefined): string[] {
  const tag = code.replace(/_/g, '-').toLowerCase()
  const names = [...flag ? [regionOf(flag).toLowerCase()] : [], `lang-${tag}`, `lang-${tag.split('-')[0]}`, 'xx']
  return [...new Set(names)]
}

/** SVG markup of the first of `names` that `set` has. */
export function flagSvg(set: IconifyJSON, names: readonly string[]): string | undefined {
  const body = names.map(name => set.icons[set.aliases?.[name]?.parent ?? name]?.body).find(Boolean)
  return body && `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${set.width ?? 512} ${set.height ?? 512}">${body}</svg>`
}

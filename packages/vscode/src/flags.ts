import type { IconifyJSON } from '@iconify-json/circle-flags'
import { Buffer } from 'node:buffer'
import { Uri } from 'vscode'
import { config } from './config'
import { flagNames, flagSvg } from './model/flags'

let flags: Promise<IconifyJSON> | undefined

/** The flag of a locale as an icon, or undefined when `x18n.showFlags` is off. SVG, since flag emoji do not render on Windows. */
export async function flagIcon(code: string, flag: string | undefined): Promise<Uri | undefined> {
  if (!config.showFlags)
    return undefined
  flags ??= import('@iconify-json/circle-flags').then(m => m.icons)
  const svg = flagSvg(await flags, flagNames(code, flag))
  return svg === undefined ? undefined : Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

import type { MessageTree, Preset, ResourceSpec } from '@x18n/core'
import { createLibraryPlugin, isMessageLeaf } from '@x18n/core'
import { angular } from '../../placeholders'
import { angularTemplates } from '../shared/angular-templates'

type Translation = string | readonly string[]

interface AngularProject {
  readonly i18n?: {
    readonly sourceLocale?: string | { readonly code?: string }
    readonly locales?: Readonly<Record<string, Translation | { readonly translation?: Translation }>>
  }
  readonly architect?: Readonly<Record<string, { readonly options?: { readonly format?: string, readonly outputPath?: string, readonly outFile?: string } }>>
}

/** The JSON files of an `i18n` block: each locale's translations and the extracted source, as resources. */
function readWorkspace(text: string): { sourceLocale: string | undefined, resources: ResourceSpec[] } {
  let workspace: { projects?: Readonly<Record<string, AngularProject>> }
  try {
    workspace = JSON.parse(text)
  }
  catch {
    return { sourceLocale: undefined, resources: [] }
  }
  const resources: ResourceSpec[] = []
  let sourceLocale: string | undefined
  for (const project of Object.values(workspace.projects ?? {})) {
    if (!project.i18n)
      continue
    const source = project.i18n.sourceLocale
    const code = (typeof source === 'string'
      ? source
      : source?.code) ?? 'en-US'
    sourceLocale ??= code
    for (const [locale, entry] of Object.entries(project.i18n.locales ?? {})) {
      const translation = typeof entry === 'string' || Array.isArray(entry)
        ? entry
        : (entry as { translation?: Translation }).translation
      for (const path of [translation ?? []].flat()) {
        if (path.endsWith('.json'))
          resources.push({ pattern: path, locale })
      }
    }
    const extract = project.architect?.['extract-i18n']?.options
    if (extract?.format === 'json') {
      const dir = extract.outputPath?.replace(/\/+$/, '')
      const file = extract.outFile ?? 'messages.json'
      resources.push({
        pattern: dir
          ? `${dir}/${file}`
          : file,
        locale: code,
      })
    }
  }
  return { sourceLocale, resources }
}

/**
 * Angular's built-in i18n: `i18n="@@id"` attributes in templates and `$localize` in code, with the JSON
 * translation files listed in `angular.json`. Those files read `{ "locale": "fr", "translations": { "id": "..." } }`.
 */
export function angularLocalize(): Preset {
  const paths = new Set<string>()
  return {
    name: 'angular-localize',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:angular-localize',
        regex: [
          {
            extensions: angularTemplates,
            patterns: ['\\bi18n(?:-[\\w.-]+)?\\s*=\\s*["\'][^"\']*?@@({key})["\']'],
          },
          {
            extensions: ['ts', 'js', 'mts', 'mjs'],
            patterns: ['\\$localize\\s*`:[^:`]*?@@({key}):'],
          },
        ],
        keyStyle: 'flat',
        transformResource: {
          applies: ctx => paths.has(ctx.path),
          read(tree) {
            const translations = tree.translations
            return translations && !isMessageLeaf(translations)
              ? translations as MessageTree
              : {}
          },
          toStored: path => [
            'translations',
            path.join('.'),
          ],
        },
        placeholders: [angular],
        async extra(draft, ctx) {
          const text = await ctx.host.readFile('angular.json')
          if (!text)
            return
          const { sourceLocale, resources } = readWorkspace(text)
          if (sourceLocale && !ctx.user.sourceLocale)
            draft.sourceLocale = sourceLocale
          for (const spec of resources)
            paths.add(spec.pattern)
          draft.resources = [
            ...draft.resources,
            ...resources.filter(spec => !draft.resources.some(r => r.pattern === spec.pattern)),
          ]
        },
      }),
    ],
  }
}

export default angularLocalize

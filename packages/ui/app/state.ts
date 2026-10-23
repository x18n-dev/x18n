import type { ShallowRef } from 'vue'
import type { LocaleSummary, ProjectList, ProjectSummary } from '../src/node/types'
import type { UiBackend } from './backend'
import { useLocalStorage } from '@vueuse/core'
import { computed, ref, shallowRef, watchEffect } from 'vue'

export const backend = shallowRef<UiBackend>()
export const projectList = shallowRef<ProjectList>()
export const projectName = ref<string>()
/** Bumps after every change from any surface; live data reloads on it. */
export const revision = ref(0)
export const recentKeys = shallowRef<readonly string[]>([])

export const currentProject = computed<ProjectSummary | undefined>(() =>
  projectList.value?.projects.find(p => p.name === projectName.value))

// Per project, from dragging the locale bar; locales it does not list keep their default place after it.
const order = useLocalStorage<Record<string, string[]>>('x18n:locale-order', {})

/** Every locale of the current project in the user's order; by default the source first. */
export const locales = computed<readonly LocaleSummary[]>(() => {
  const project = currentProject.value
  if (!project)
    return []
  const byDefault = [
    ...project.locales.filter(l => l.code === project.sourceLocale),
    ...project.locales.filter(l => l.code !== project.sourceLocale),
  ]
  const picked = order.value[project.name] ?? []
  const rank = (code: string): number => {
    const at = picked.indexOf(code)
    return at === -1
      ? picked.length
      : at
  }
  return byDefault.map((locale, i) => ({ locale, i })).sort((a, b) => rank(a.locale.code) - rank(b.locale.code) || a.i - b.i).map(({ locale }) => locale)
})

export const isLocaleOrderCustom = computed(() => Boolean(order.value[projectName.value ?? '']))

/** Moves a locale to `index` in `locales`. */
export function moveLocale(code: string, index: number): void {
  const project = projectName.value
  if (!project)
    return
  const codes = locales.value.map(l => l.code).filter(c => c !== code)
  codes.splice(Math.max(0, Math.min(index, codes.length)), 0, code)
  order.value = { ...order.value, [project]: codes }
}

export function resetLocaleOrder(): void {
  const { [projectName.value ?? '']: _, ...rest } = order.value
  order.value = rest
}

// Hidden rather than shown, per project, so a locale added later shows up.
const hidden = useLocalStorage<Record<string, string[]>>('x18n:hidden-locales', {})
const hiddenHere = computed(() => new Set(hidden.value[projectName.value ?? ''] ?? []))

/** The locales the views show, in `locales` order. */
export const visibleLocales = computed(() => locales.value.filter(l => !hiddenHere.value.has(l.code)))

export function isLocaleVisible(code: string): boolean {
  return !hiddenHere.value.has(code)
}

export function toggleLocale(code: string): void {
  const project = projectName.value
  if (!project)
    return
  const next = new Set(hiddenHere.value)
  if (!next.delete(code))
    next.add(code)
  hidden.value = {
    ...hidden.value,
    [project]: [...next],
  }
}

export function showAllLocales(): void {
  const { [projectName.value ?? '']: _, ...rest } = hidden.value
  hidden.value = rest
}

/** Data for the current project, reloaded when the project or anything in it changes. */
export function useLive<T>(load: (backend: UiBackend, project: string) => Promise<T>): ShallowRef<T | undefined> {
  const data = shallowRef<T>()
  let latest = 0
  watchEffect(() => {
    const b = backend.value
    const project = projectName.value
    void revision.value
    if (!b || !project)
      return
    const request = ++latest
    void load(b, project).then((value) => {
      if (request === latest)
        data.value = value
    })
  })
  return data
}

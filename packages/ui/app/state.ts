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

/** Every locale of the current project, the source first. */
export const locales = computed<readonly LocaleSummary[]>(() => {
  const project = currentProject.value
  if (!project)
    return []
  return [...project.locales.filter(l => l.code === project.sourceLocale), ...project.locales.filter(l => l.code !== project.sourceLocale)]
})

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
  hidden.value = { ...hidden.value, [project]: [...next] }
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

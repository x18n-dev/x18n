<script setup lang="ts">
import type { ExtractCandidate } from '@x18n/builtins/extractors'
import { computed, ref, watch } from 'vue'
import FilePath from '../components/FilePath.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSection from '../components/ui/UiSection.vue'
import { t } from '../i18n'
import { backend, projectName, useLive } from '../state'

const candidates = useLive((b, project) => b.extractCandidates(project))
const table = useLive((b, project) => b.keys(project))

/** Source values of the keys that already exist. */
const existing = computed(() => {
  const keys = table.value
  return new Map(keys?.rows.map(row => [row.key, row.values[keys.sourceLocale]]))
})

interface Draft { id: string, candidate: ExtractCandidate, key: string, picked: boolean }
const drafts = ref<Draft[]>([])
// Candidates reload after every extraction; keep the picks and edited keys of the strings still left.
watch(candidates, (list) => {
  const previous = new Map(drafts.value.map(d => [d.id, d]))
  const seen = new Map<string, number>()
  drafts.value = (list ?? []).map((candidate) => {
    const base = `${candidate.path}\0${candidate.original}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = `${base}\0${n}`
    const before = previous.get(id)
    const key = before && before.key !== before.candidate.key ? before.key : candidate.key
    return { id, candidate, key, picked: before?.picked ?? false }
  })
})

const byFile = computed(() => {
  const groups = new Map<string, Draft[]>()
  for (const draft of drafts.value) {
    const list = groups.get(draft.candidate.path) ?? []
    groups.set(draft.candidate.path, list)
    list.push(draft)
  }
  return [...groups]
})
const picked = computed(() => drafts.value.filter(d => d.picked))
const result = ref<{ count: number, files: number }>()
const busy = ref(false)

async function extract(list: readonly Draft[]): Promise<void> {
  const items = list.map(({ candidate: c, key }) => ({
    path: c.path,
    range: c.range,
    original: c.original,
    key,
    value: c.value,
    replacement: c.replacement.replace(c.key, key),
    imports: c.imports,
  }))
  busy.value = true
  try {
    const applied = await backend.value!.extractApply({ project: projectName.value, items })
    result.value = { count: applied.keys.length, files: applied.changes.length }
  }
  finally {
    busy.value = false
  }
}

/** A file's picked strings, or all of them when none is picked. */
function fileBatch(list: readonly Draft[]): readonly Draft[] {
  const some = list.filter(d => d.picked)
  return some.length ? some : list
}
</script>

<template>
  <UiPage>
    <header class="flex items-center gap-3 border-b border-base px-4 py-3">
      <p class="flex-auto color-muted">
        {{ t('extract.hint') }}
      </p>
      <span v-if="result" class="color-ok">{{ t('extract.done', result) }}</span>
      <button v-if="backend?.capabilities.write" class="btn-solid" :disabled="!picked.length || busy" @click="extract(picked)">
        {{ t('extract.apply', { count: picked.length }) }}
      </button>
    </header>
    <p v-if="candidates && !drafts.length" class="px-4 py-3 color-muted">
      {{ t('extract.none') }}
    </p>
    <UiSection v-for="([path, list], i) in byFile" :key="path" :index="String(i + 1).padStart(2, '0')" :title="t('extract.strings', { count: list.length })">
      <template #aside>
        <FilePath :path="path" class="ml-2 flex-auto" />
        <button v-if="backend?.capabilities.write" class="btn-outline" :disabled="busy" @click="extract(fileBatch(list))">
          {{ list.some(d => d.picked) ? t('extract.apply', { count: fileBatch(list).length }) : t('extract.applyFile', { count: list.length }) }}
        </button>
      </template>
      <label v-for="draft in list" :key="draft.id" class="grid grid-cols-[auto_3rem_1fr_18rem_4.5rem_auto] items-center gap-3 border-b border-base px-4 py-1.5 last:border-b-0">
        <input v-model="draft.picked" type="checkbox" class="accent-[var(--x-fg)]" :disabled="!backend?.capabilities.write">
        <span class="text-right font-mono text-xs color-faint tabular-nums">{{ draft.candidate.line }}</span>
        <span class="truncate" :title="draft.candidate.text">{{ draft.candidate.text }}</span>
        <input v-model="draft.key" class="input font-mono text-xs" :readonly="!backend?.capabilities.write" :aria-label="t('extract.key')">
        <span
          v-if="existing.has(draft.key)"
          class="badge justify-center"
          :class="existing.get(draft.key) !== draft.candidate.value && 'color-warn'"
          :title="t('extract.existingHint', { value: String(existing.get(draft.key) ?? '') })"
        >{{ t('extract.existing') }}</span>
        <span v-else class="badge justify-center color-ok" :title="t('extract.newHint')">{{ t('extract.new') }}</span>
        <button v-if="backend?.capabilities.write" class="btn-ghost" :disabled="busy || !draft.key" @click.prevent="extract([draft])">
          {{ t('extract.one') }}
        </button>
      </label>
    </UiSection>
  </UiPage>
</template>

<script setup lang="ts">
import type { ExtractCandidate } from '@x18n/builtins/extractors'
import { computed, ref, watch } from 'vue'
import FilePath from '../components/FilePath.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSection from '../components/ui/UiSection.vue'
import { t } from '../i18n'
import { backend, projectName, useLive } from '../state'

const candidates = useLive((b, project) => b.extractCandidates(project))

interface Draft { candidate: ExtractCandidate, key: string, picked: boolean }
const drafts = ref<Draft[]>([])
watch(candidates, (list) => {
  drafts.value = (list ?? []).map(candidate => ({ candidate, key: candidate.key, picked: true }))
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

async function apply(): Promise<void> {
  const items = picked.value.map(({ candidate: c, key }) => ({
    path: c.path,
    range: c.range,
    original: c.original,
    key,
    value: c.value,
    replacement: c.replacement.replace(c.key, key),
    imports: c.imports,
  }))
  const applied = await backend.value!.extractApply({ project: projectName.value, items })
  result.value = { count: applied.keys.length, files: applied.changes.length }
}
</script>

<template>
  <UiPage>
    <header class="flex items-center gap-3 border-b border-base px-4 py-3">
      <p class="flex-auto color-muted">
        {{ t('extract.hint') }}
      </p>
      <span v-if="result" class="color-ok">{{ t('extract.done', result) }}</span>
      <button v-if="backend?.capabilities.write" class="btn-solid" :disabled="!picked.length" @click="apply">
        {{ t('extract.apply', { count: picked.length }) }}
      </button>
    </header>
    <p v-if="candidates && !drafts.length" class="px-4 py-3 color-muted">
      {{ t('extract.none') }}
    </p>
    <UiSection v-for="([path, list], i) in byFile" :key="path" :index="String(i + 1).padStart(2, '0')" :title="t('extract.strings', { count: list.length })">
      <template #aside>
        <FilePath :path="path" class="ml-2" />
      </template>
      <label v-for="draft in list" :key="draft.candidate.range.start" class="grid grid-cols-[auto_3rem_1fr_18rem] items-center gap-3 border-b border-base px-4 py-1.5 last:border-b-0">
        <input v-model="draft.picked" type="checkbox" class="accent-[var(--x-fg)]" :disabled="!backend?.capabilities.write">
        <span class="text-right font-mono text-xs color-faint tabular-nums">{{ draft.candidate.line }}</span>
        <span class="truncate" :title="draft.candidate.text">{{ draft.candidate.text }}</span>
        <input v-model="draft.key" class="input font-mono text-xs" :readonly="!backend?.capabilities.write" :aria-label="t('extract.key')">
      </label>
    </UiSection>
  </UiPage>
</template>

<script setup lang="ts">
import type { ExplainList } from '../../src/node/types'
import { computed, onMounted, ref, shallowRef } from 'vue'
import FilePath from '../components/FilePath.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSection from '../components/ui/UiSection.vue'
import { t } from '../i18n'
import { backend, projectName } from '../state'

const list = shallowRef<ExplainList>()
onMounted(async () => {
  list.value = await backend.value!.explain()
})
const explain = computed(() => list.value?.projects.find(p => p.name === projectName.value))

/** Listed or detected presets are the ones in effect; the rest sit behind a button. */
const showAll = ref(false)
const presets = computed(() => (explain.value?.presets ?? []).filter(p => showAll.value || isActive(p.reason)))
const hiddenPresets = computed(() => (explain.value?.presets.length ?? 0) - presets.value.length)

function isActive(reason: string): boolean {
  return reason === 'listed' || reason === 'detected'
}
</script>

<template>
  <UiPage v-if="explain">
    <UiSection index="01" :title="t('project.presets')">
      <div v-for="preset in presets" :key="preset.name" class="flex items-center gap-2 border-b border-base px-4 py-1.5 last:border-b-0">
        <span :class="isActive(preset.reason) ? 'i-ph-check-circle-duotone color-ok' : 'i-ph-circle-duotone color-faint'" />
        <span class="flex-auto font-mono text-xs">{{ preset.name }}</span>
        <span class="label">{{ preset.reason }}</span>
      </div>
      <button v-if="hiddenPresets" class="btn-ghost h-9 w-full justify-start px-4" @click="showAll = true">
        <span class="i-ph-dots-three-duotone" /> {{ t('project.showAllPresets') }} ({{ hiddenPresets }})
      </button>
    </UiSection>

    <UiSection index="02" :title="t('project.finders')">
      <details v-for="finder in explain.finders" :key="finder.id" class="group border-b border-base last:border-b-0">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-1.5 hover:bg-hover">
          <span class="i-ph-caret-right-duotone text-xs color-muted transition-transform group-open:rotate-90" />
          <span class="font-mono text-xs">{{ finder.id }}</span>
          <span class="label">{{ t('project.resources', { count: finder.resources.length }) }}</span>
        </summary>
        <div class="grid gap-1 pb-2 pl-10 pr-4">
          <FilePath v-for="path in finder.resources" :key="path" :path="path" />
        </div>
      </details>
    </UiSection>

    <div class="grid md:grid-cols-2">
      <UiSection index="03" :title="t('project.formats')" class="md:border-r">
        <div v-for="format in explain.formats.filter(f => f.resources > 0)" :key="format.id" class="flex gap-2 border-b border-base px-4 py-1.5 font-mono text-xs last:border-b-0">
          <span class="flex-auto">{{ format.id }} <span class="color-faint">{{ format.extensions.join(', ') }}</span></span>
          <span class="tabular-nums">{{ format.resources }}</span>
        </div>
      </UiSection>
      <UiSection index="04" :title="t('project.scanners')">
        <div v-for="scanner in explain.scanners" :key="scanner.id" class="flex gap-2 border-b border-base px-4 py-1.5 font-mono text-xs last:border-b-0">
          <span class="flex-auto">{{ scanner.id }} <span class="color-faint">{{ scanner.extensions.join(', ') }}</span></span>
          <span class="tabular-nums color-muted">{{ t('project.files', { count: scanner.files }) }}</span>
        </div>
      </UiSection>
    </div>

    <UiSection v-if="explain.errors.length || explain.conflicts.length" index="05" :title="t('project.problems')">
      <div v-for="(e, i) in explain.errors" :key="`e${i}`" class="flex items-center gap-2 border-b border-base px-4 py-1.5 color-error last:border-b-0">
        <span class="font-mono text-xs">{{ e.name }}</span> {{ e.why }} <FilePath v-if="e.path" :path="e.path" />
      </div>
      <div v-for="c in explain.conflicts" :key="c.extension" class="border-b border-base px-4 py-1.5 color-warn last:border-b-0">
        {{ t('project.conflict', { extension: c.extension, winner: c.winner, loser: c.loser }) }}
      </div>
    </UiSection>

    <UiSection index="06" :title="t('project.config')">
      <div v-for="(origin, field) in explain.config.origins" :key="field" class="flex gap-2 border-b border-base px-4 py-1.5 font-mono text-xs">
        <span class="flex-auto">{{ field }}</span>
        <span class="color-muted">{{ origin }}</span>
      </div>
      <pre class="of-x-auto p-4 font-mono text-xs leading-5 color-muted">{{ JSON.stringify(explain.config, null, 2) }}</pre>
    </UiSection>
  </UiPage>
</template>

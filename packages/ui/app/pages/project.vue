<script setup lang="ts">
import type { ExplainList } from '../../src/node/types'
import { computed, onMounted, ref, shallowRef } from 'vue'
import FilePath from '../components/FilePath.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSection from '../components/ui/UiSection.vue'
import UiStat from '../components/ui/UiStat.vue'
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

const formats = computed(() => (explain.value?.formats ?? []).filter(f => f.resources > 0))
const maxResources = computed(() => Math.max(1, ...formats.value.map(f => f.resources)))
const maxFiles = computed(() => Math.max(1, ...(explain.value?.scanners ?? []).map(s => s.files)))

const totalResources = computed(() => explain.value?.finders.reduce((sum, f) => sum + f.resources.length, 0) ?? 0)
const problemCount = computed(() => (explain.value?.errors.length ?? 0) + (explain.value?.conflicts.length ?? 0))

const stats = computed(() => explain.value && [
  {
    label: t('project.presets'),
    value: explain.value.presets.filter(p => isActive(p.reason)).length,
  },
  {
    label: t('project.finders'),
    value: explain.value.finders.length,
  },
  {
    label: t('overview.resources'),
    value: totalResources.value,
  },
  {
    label: t('project.problems'),
    value: problemCount.value,
  },
])

const origins = computed(() => Object.entries(explain.value?.config.origins ?? {}))
</script>

<template>
  <UiPage v-if="explain">
    <div class="grid grid-cols-2 border-b border-base md:grid-cols-4">
      <UiStat
        v-for="stat in stats"
        :key="stat.label"
        :label="stat.label"
        :value="stat.value"
        class="border-r border-base last:border-r-0 max-md:nth-[2n]:border-r-0"
        :class="stat.label === t('project.problems') && stat.value > 0 && 'color-error'"
      />
    </div>

    <UiSection v-if="problemCount" :title="t('project.problems')">
      <div v-for="(e, i) in explain.errors" :key="`e${i}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-base px-4 py-2 last:border-b-0">
        <span class="i-ph-warning-circle-duotone color-error" />
        <span class="font-mono text-xs color-error">{{ e.name }}</span>
        <span class="text-xs color-muted">{{ e.why }}</span>
        <FilePath v-if="e.path" :path="e.path" />
      </div>
      <div v-for="c in explain.conflicts" :key="c.extension" class="flex items-center gap-3 border-b border-base px-4 py-2 text-xs color-warn last:border-b-0">
        <span class="i-ph-warning-duotone" />
        {{ t('project.conflict', { extension: c.extension, winner: c.winner, loser: c.loser }) }}
      </div>
    </UiSection>

    <UiSection :title="t('project.presets')">
      <div class="flex flex-wrap gap-2 p-4">
        <span
          v-for="preset in presets"
          :key="preset.name"
          class="inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-xs"
          :class="isActive(preset.reason) ? 'border-strong' : 'border-base color-muted'"
        >
          <span :class="isActive(preset.reason) ? 'i-ph-check-circle-duotone color-ok' : 'i-ph-circle-duotone color-faint'" />
          {{ preset.name }}
          <span class="label">{{ preset.reason }}</span>
        </span>
        <button v-if="hiddenPresets" class="btn-ghost h-7" @click="showAll = true">
          <span class="i-ph-dots-three-duotone" /> {{ t('project.showAllPresets') }} ({{ hiddenPresets }})
        </button>
      </div>
      <div v-if="explain.plugins.length" class="flex flex-wrap items-center gap-2 border-t border-base px-4 py-2">
        <span class="label">{{ t('project.plugins') }}</span>
        <span v-for="plugin in explain.plugins" :key="plugin" class="badge">{{ plugin }}</span>
      </div>
    </UiSection>

    <UiSection :title="t('project.finders')">
      <details v-for="finder in explain.finders" :key="finder.id" class="group border-b border-base last:border-b-0">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-hover">
          <span class="i-ph-caret-right-duotone text-xs color-muted transition-transform group-open:rotate-90" />
          <span class="flex-auto font-mono text-xs">{{ finder.id }}</span>
          <span class="label">{{ t('project.resources', { count: finder.resources.length }) }}</span>
        </summary>
        <div class="grid gap-1 pb-3 pl-10 pr-4">
          <FilePath v-for="path in finder.resources" :key="path" :path="path" />
        </div>
      </details>
      <div v-if="!explain.finders.length" class="px-4 py-3 text-xs color-muted">
        {{ t('project.none') }}
      </div>
      <details v-if="explain.duplicates.length" class="group border-t border-base">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-hover">
          <span class="i-ph-caret-right-duotone text-xs color-muted transition-transform group-open:rotate-90" />
          <span class="flex-auto text-xs color-muted">{{ t('project.duplicates', { count: explain.duplicates.length }) }}</span>
        </summary>
        <div v-for="d in explain.duplicates" :key="`${d.finder}:${d.path}`" class="flex flex-wrap items-center gap-2 pb-2 pl-10 pr-4 text-xs color-muted">
          <FilePath :path="d.path" />
          <span class="font-mono">{{ d.finder }} → {{ d.keptFrom }}</span>
        </div>
      </details>
    </UiSection>

    <div class="grid md:grid-cols-2">
      <UiSection :title="t('project.formats')" class="md:border-r">
        <div v-for="format in formats" :key="format.id" class="grid gap-1.5 border-b border-base px-4 py-2 last:border-b-0">
          <div class="flex items-baseline gap-2 font-mono text-xs">
            <span class="flex-auto">{{ format.id }} <span class="color-faint">{{ format.extensions.join(', ') }}</span></span>
            <span class="tabular-nums">{{ format.resources }}</span>
          </div>
          <span class="h-1 border border-strong"><span class="block h-full bg-inverse" :style="{ width: `${(format.resources / maxResources) * 100}%` }" /></span>
        </div>
        <div v-if="!formats.length" class="px-4 py-3 text-xs color-muted">
          {{ t('project.none') }}
        </div>
      </UiSection>
      <UiSection :title="t('project.scanners')">
        <div v-for="scanner in explain.scanners" :key="scanner.id" class="grid gap-1.5 border-b border-base px-4 py-2 last:border-b-0">
          <div class="flex items-baseline gap-2 font-mono text-xs">
            <span class="flex-auto">{{ scanner.id }} <span class="color-faint">{{ scanner.extensions.join(', ') }}</span></span>
            <span class="tabular-nums color-muted">{{ t('project.files', { count: scanner.files }) }}</span>
          </div>
          <span class="h-1 border border-strong"><span class="block h-full bg-inverse" :style="{ width: `${(scanner.files / maxFiles) * 100}%` }" /></span>
        </div>
        <div v-if="!explain.scanners.length" class="px-4 py-3 text-xs color-muted">
          {{ t('project.none') }}
        </div>
      </UiSection>
    </div>

    <UiSection v-if="explain.skipped.length" :title="t('project.skipped')">
      <div v-for="s in explain.skipped" :key="s.name" class="flex gap-3 border-b border-base px-4 py-2 font-mono text-xs last:border-b-0">
        <span class="flex-auto">{{ s.name }}</span>
        <span class="color-muted">{{ s.reason }}</span>
      </div>
    </UiSection>

    <UiSection :title="t('project.config')">
      <div v-for="[field, origin] in origins" :key="field" class="flex gap-2 border-b border-base px-4 py-1.5 font-mono text-xs">
        <span class="flex-auto">{{ field }}</span>
        <span class="color-muted">{{ origin }}</span>
      </div>
      <details class="group">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-hover">
          <span class="i-ph-caret-right-duotone text-xs color-muted transition-transform group-open:rotate-90" />
          <span class="label">{{ t('project.rawConfig') }}</span>
        </summary>
        <pre class="of-x-auto border-t border-base p-4 font-mono text-xs leading-5 color-muted">{{ JSON.stringify(explain.config, null, 2) }}</pre>
      </details>
    </UiSection>
  </UiPage>
</template>

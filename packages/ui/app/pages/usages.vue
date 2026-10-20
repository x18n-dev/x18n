<script setup lang="ts">
import type { UsageView } from '../../src/node/types'
import { computed, ref } from 'vue'
import { NuxtLink } from '#components'
import CodeSnippet from '../components/CodeSnippet.vue'
import FilePath from '../components/FilePath.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSegmented from '../components/ui/UiSegmented.vue'
import { t } from '../i18n'
import { useLive } from '../state'

const analysis = useLive((b, project) => b.analysis(project))
const usages = useLive((b, project) => b.usages(project))

const tab = ref<'missing' | 'unused' | 'dynamic' | 'all'>('missing')
const filter = ref('')

const undefinedByKey = computed(() => {
  const groups = new Map<string, UsageView[]>()
  for (const usage of analysis.value?.undefinedUsages ?? []) {
    const list = groups.get(usage.key ?? usage.raw) ?? []
    groups.set(usage.key ?? usage.raw, list)
    list.push(usage)
  }
  return [...groups]
})
const dynamic = computed(() => (usages.value ?? []).filter(u => u.dynamic !== false))
const all = computed(() => (usages.value ?? []).filter(u => !filter.value || u.path.includes(filter.value) || (u.key ?? u.raw).includes(filter.value)))

const tabs = computed(() => [
  { value: 'missing' as const, label: t('usages.missing', { count: undefinedByKey.value.length }) },
  { value: 'unused' as const, label: t('usages.unused', { count: analysis.value?.unused.length ?? 0 }) },
  { value: 'dynamic' as const, label: t('usages.dynamic', { count: dynamic.value.length }) },
  { value: 'all' as const, label: t('usages.all', { count: usages.value?.length ?? 0 }) },
])
</script>

<template>
  <UiPage>
    <div class="flex flex-wrap items-center gap-3 border-b border-base px-4 py-3">
      <UiSegmented v-model="tab" :options="tabs" :label="t('nav.usages')" />
      <input v-if="tab === 'all'" v-model="filter" class="input w-72" :placeholder="t('usages.filter')" :aria-label="t('usages.filter')">
    </div>

    <template v-if="tab === 'missing'">
      <p class="border-b border-base px-4 py-2 text-xs color-muted">
        {{ t('usages.missingHint') }}
      </p>
      <div v-for="[key, list] in undefinedByKey" :key="key" class="grid gap-2 border-b border-base px-4 py-3">
        <span class="font-mono font-medium color-error">{{ key }}</span>
        <div v-for="(usage, i) in list" :key="i" class="grid gap-1">
          <FilePath :path="usage.path" :line="usage.line" :column="usage.column" />
          <CodeSnippet :usage="usage" />
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'unused'">
      <p class="border-b border-base px-4 py-2 text-xs color-muted">
        {{ t('usages.unusedHint') }}
      </p>
      <NuxtLink v-for="key in analysis?.unused" :key="key" :to="`/keys/${encodeURIComponent(key)}`" class="focus-ring flex items-center gap-2 border-b border-base px-4 py-1.5 font-mono text-xs transition-colors hover:bg-hover">
        <span class="i-ph-ghost color-faint" />
        {{ key }}
      </NuxtLink>
    </template>

    <template v-else-if="tab === 'dynamic'">
      <p class="border-b border-base px-4 py-2 text-xs color-muted">
        {{ t('usages.dynamicHint') }}
      </p>
      <div v-for="(usage, i) in dynamic" :key="i" class="grid gap-1 border-b border-base px-4 py-3">
        <div class="flex items-center gap-2">
          <FilePath :path="usage.path" :line="usage.line" />
          <code class="font-mono text-xs color-info">{{ usage.raw }}</code>
        </div>
        <CodeSnippet :usage="usage" />
      </div>
    </template>

    <template v-else>
      <div v-for="(usage, i) in all" :key="i" class="grid grid-cols-[minmax(0,22rem)_1fr] items-center gap-4 border-b border-base px-4 py-1 transition-colors hover:bg-hover">
        <FilePath :path="usage.path" :line="usage.line" />
        <NuxtLink v-if="usage.key" :to="`/keys/${encodeURIComponent(usage.key)}`" class="truncate font-mono text-xs hover:underline">
          {{ usage.key }}
        </NuxtLink>
        <span v-else class="truncate font-mono text-xs color-muted">{{ usage.raw }}</span>
      </div>
    </template>
  </UiPage>
</template>

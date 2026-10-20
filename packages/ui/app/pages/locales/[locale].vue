<script setup lang="ts">
import { computed } from 'vue'
import { NuxtLink } from '#components'
import { useRoute } from '#imports'
import CopyPrompt from '../../components/CopyPrompt.vue'
import LocaleFlag from '../../components/LocaleFlag.vue'
import MessageText from '../../components/MessageText.vue'
import UiPage from '../../components/ui/UiPage.vue'
import UiSection from '../../components/ui/UiSection.vue'
import { formatPercent, languageName, t } from '../../i18n'
import { currentProject, isLocaleVisible, projectName, toggleLocale, useLive } from '../../state'

const route = useRoute()
const code = computed(() => String(route.params.locale))
const summary = computed(() => currentProject.value?.locales.find(l => l.code === code.value))
const isSource = computed(() => code.value === currentProject.value?.sourceLocale)

const table = useLive((b, project) => b.keys(project))
const analysis = useLive((b, project) => b.analysis(project))

const missing = computed(() => (table.value?.rows ?? []).filter(r => r.missing.includes(code.value) && r.values[code.value] === undefined))
const empty = computed(() => (table.value?.rows ?? []).filter(r => r.missing.includes(code.value) && r.values[code.value] !== undefined))
const problems = computed(() => (analysis.value?.diagnostics ?? []).filter(d => d.locale === code.value && (d.code === 'placeholder-mismatch' || d.code === 'invalid-syntax')))

function showInGrid(): void {
  if (!isLocaleVisible(code.value))
    toggleLocale(code.value)
}
</script>

<template>
  <UiPage>
    <header class="grid gap-4 border-b border-base px-4 py-5">
      <div class="flex items-end gap-3">
        <div class="grid gap-1">
          <span class="label">{{ t('locale.label') }}</span>
          <h1 class="flex items-center gap-3 font-mono text-2xl font-medium">
            <LocaleFlag :code="code" />
            {{ code }}
          </h1>
        </div>
        <span v-if="summary" class="pb-1 color-muted">{{ languageName(code) ?? summary.displayName }}</span>
        <span v-if="isSource" class="badge mb-1.5">{{ t('overview.source') }}</span>
        <span class="flex-auto" />
        <NuxtLink :to="{ path: '/keys', query: { missing: code } }" class="btn-outline" @click="showInGrid">
          <span class="i-ph-table" /> {{ t('locale.openInGrid') }}
        </NuxtLink>
        <CopyPrompt v-if="!isSource" :query="{ project: projectName, locale: code }" class="h-8" />
      </div>
      <div v-if="summary" class="grid gap-1.5">
        <span class="h-2 border border-strong">
          <span class="block h-full bg-inverse" :style="{ width: `${summary.percent}%` }" />
        </span>
        <span class="font-mono text-xs color-muted tabular-nums">{{ t('locale.progress', { translated: summary.translated, total: summary.total, percent: formatPercent(summary.percent) }) }}</span>
      </div>
      <p v-else-if="currentProject" class="color-muted">
        {{ t('locale.notFound') }}
      </p>
    </header>

    <UiSection v-if="missing.length" index="01" :title="t('locale.missing', { count: missing.length })">
      <NuxtLink v-for="row in missing" :key="row.key" :to="`/keys/${encodeURIComponent(row.key)}`" class="focus-ring grid grid-cols-[minmax(0,20rem)_1fr] items-baseline gap-4 border-b border-base px-4 py-1.5 transition-colors last:border-b-0 hover:bg-hover">
        <span class="truncate font-mono text-xs">{{ row.key }}</span>
        <span class="truncate color-muted"><MessageText :value="row.values[currentProject?.sourceLocale ?? '']" inline /></span>
      </NuxtLink>
    </UiSection>

    <UiSection v-if="empty.length" index="02" :title="t('locale.empty', { count: empty.length })">
      <NuxtLink v-for="row in empty" :key="row.key" :to="`/keys/${encodeURIComponent(row.key)}`" class="focus-ring grid grid-cols-[minmax(0,20rem)_1fr] items-baseline gap-4 border-b border-base px-4 py-1.5 transition-colors last:border-b-0 hover:bg-hover">
        <span class="truncate font-mono text-xs">{{ row.key }}</span>
        <span class="truncate color-muted"><MessageText :value="row.values[currentProject?.sourceLocale ?? '']" inline /></span>
      </NuxtLink>
    </UiSection>

    <UiSection v-if="problems.length" index="03" :title="t('locale.problems', { count: problems.length })">
      <component
        :is="d.key ? NuxtLink : 'div'"
        v-for="(d, i) in problems"
        :key="i"
        :to="d.key ? `/keys/${encodeURIComponent(d.key)}` : undefined"
        class="flex items-center gap-2 border-b border-base px-4 py-1.5 last:border-b-0"
        :class="d.key && 'transition-colors hover:bg-hover'"
      >
        <span :class="d.severity === 'error' ? 'i-ph-x-circle color-error' : 'i-ph-warning color-warn'" />
        <span class="font-mono text-xs color-muted">{{ d.code }}</span>
        <span v-if="d.key" class="font-mono text-xs">{{ d.key }}</span>
        <span class="flex-auto truncate">{{ d.message }}</span>
      </component>
    </UiSection>

    <p v-if="summary && table && !missing.length && !empty.length && !problems.length" class="flex items-center gap-2 px-4 py-3 color-ok">
      <span class="i-ph-check-circle" /> {{ t('locale.complete') }}
    </p>
  </UiPage>
</template>

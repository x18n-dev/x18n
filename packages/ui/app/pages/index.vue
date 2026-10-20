<script setup lang="ts">
import type { LocaleSummary } from '../../src/node/types'
import { computed } from 'vue'
import { NuxtLink } from '#components'
import ChangeInfo from '../components/ChangeInfo.vue'
import LocaleFlag from '../components/LocaleFlag.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiSection from '../components/ui/UiSection.vue'
import UiStat from '../components/ui/UiStat.vue'
import { formatPercent, languageName, t } from '../i18n'
import { currentProject as project, recentKeys, visibleLocales } from '../state'

function outdatedPercent(locale: LocaleSummary): number {
  return locale.total === 0 ? 0 : (locale.outdated / locale.total) * 100
}

const stats = computed(() => project.value && [
  { label: t('overview.keys'), value: project.value.keys, to: '/keys' },
  { label: t('overview.resources'), value: project.value.resources, to: '/project' },
  { label: t('overview.usages'), value: project.value.usages, to: '/usages' },
  { label: t('overview.locales'), value: project.value.locales.length, to: '/keys' },
])
</script>

<template>
  <UiPage v-if="project">
    <div class="grid grid-cols-2 border-b border-base md:grid-cols-4">
      <NuxtLink v-for="stat in stats" :key="stat.label" :to="stat.to" class="focus-ring border-r border-base transition-colors last:border-r-0 hover:bg-hover">
        <UiStat :label="stat.label" :value="stat.value" />
      </NuxtLink>
    </div>

    <UiSection index="01" :title="t('overview.coverage')">
      <p v-if="!visibleLocales.length" class="px-4 py-3 color-muted">
        {{ t('localeBar.noneShown') }}
      </p>
      <NuxtLink
        v-for="locale in visibleLocales"
        :key="locale.code"
        :to="`/locales/${encodeURIComponent(locale.code)}`"
        class="focus-ring grid grid-cols-[7rem_1fr_4.5rem_14rem] items-center gap-4 border-b border-base px-4 py-2 transition-colors last:border-b-0 hover:bg-hover"
      >
        <span class="flex items-center gap-2 font-mono">
          <LocaleFlag :code="locale.code" />
          {{ locale.code }}
          <span v-if="locale.code === project.sourceLocale" class="badge">{{ t('overview.source') }}</span>
        </span>
        <span class="h-1.5 flex border border-strong" :title="languageName(locale.code)">
          <span class="h-full bg-inverse" :style="{ width: `${Math.max(0, locale.percent - outdatedPercent(locale))}%` }" />
          <span class="h-full bg-[var(--x-warn)]" :style="{ width: `${outdatedPercent(locale)}%` }" />
        </span>
        <span class="text-right font-mono tabular-nums" :class="locale.percent >= 100 && 'color-ok'">{{ formatPercent(locale.percent) }}</span>
        <span class="text-xs color-muted tabular-nums">
          {{ t('overview.missing', { missing: locale.missing, empty: locale.empty }) }}
          <span v-if="locale.outdated" class="color-warn">· {{ t('overview.outdated', { count: locale.outdated }) }}</span>
        </span>
      </NuxtLink>
    </UiSection>

    <div class="grid md:grid-cols-2">
      <UiSection index="02" :title="t('overview.diagnostics')" class="md:border-r">
        <template #aside>
          <span class="flex-auto" />
          <span class="font-mono text-xs color-error tabular-nums">{{ t('overview.errors', { count: project.diagnostics.errors }) }}</span>
          <span class="font-mono text-xs color-warn tabular-nums">{{ t('overview.warnings', { count: project.diagnostics.warnings }) }}</span>
        </template>
        <p v-if="!project.diagnostics.byCode.length" class="px-4 py-3 color-muted">
          {{ t('overview.clean') }}
        </p>
        <div v-for="d in project.diagnostics.byCode" :key="d.code" class="flex items-center gap-2 px-4 py-1.5">
          <span :class="d.severity === 'error' ? 'i-ph-x-circle color-error' : 'i-ph-warning color-warn'" />
          <span class="flex-auto font-mono text-xs">{{ d.code }}</span>
          <span class="font-mono tabular-nums">{{ d.count }}</span>
        </div>
      </UiSection>

      <div>
        <UiSection index="03" :title="t('overview.presets')">
          <div class="flex flex-wrap gap-1 px-4 py-3">
            <span v-for="preset in project.presets" :key="preset" class="border border-strong px-1.5 font-mono text-xs">{{ preset }}</span>
            <span v-if="!project.presets.length" class="color-muted">{{ t('overview.noPresets') }}</span>
          </div>
        </UiSection>
        <UiSection index="04" :title="t('overview.recent')">
          <div class="flex flex-wrap gap-1 px-4 py-3">
            <NuxtLink v-for="key in recentKeys" :key="key" :to="`/keys/${encodeURIComponent(key)}`" class="focus-ring border border-base px-1.5 font-mono text-xs hover:border-inverse">
              {{ key }}
            </NuxtLink>
            <span v-if="!recentKeys.length" class="color-muted">{{ t('overview.noRecent') }}</span>
          </div>
        </UiSection>
      </div>
    </div>

    <UiSection v-if="project.changes.length" index="05" :title="t('history.title')">
      <NuxtLink
        v-for="change in project.changes"
        :key="`${change.key}:${change.locale}`"
        :to="`/keys/${encodeURIComponent(change.key)}`"
        class="focus-ring grid grid-cols-[minmax(0,20rem)_6rem_1fr] items-center gap-4 border-b border-base px-4 py-1.5 transition-colors last:border-b-0 hover:bg-hover"
      >
        <span class="truncate font-mono text-xs">{{ change.key }}</span>
        <span class="flex items-center gap-2 font-mono text-xs"><LocaleFlag :code="change.locale" />{{ change.locale }}</span>
        <ChangeInfo :change="change" />
      </NuxtLink>
    </UiSection>
  </UiPage>
</template>

<script setup lang="ts">
import { formatPercent, languageName, t } from '../i18n'
import { currentProject, isLocaleVisible, locales, showAllLocales, toggleLocale, visibleLocales } from '../state'
</script>

<template>
  <div class="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5" role="toolbar" :aria-label="t('localeBar.bar')">
    <span class="label">{{ t('localeBar.title') }}</span>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="locale in locales"
        :key="locale.code"
        type="button"
        class="focus-ring relative h-7 flex items-center gap-2 border px-2 font-mono text-xs transition-colors"
        :class="isLocaleVisible(locale.code) ? 'border-strong color-base hover:border-inverse' : 'border-dashed border-base color-faint hover:color-muted'"
        :aria-pressed="isLocaleVisible(locale.code)"
        :title="t('localeBar.toggle', { locale: languageName(locale.code) ?? locale.code })"
        :data-locale-toggle="locale.code"
        @click="toggleLocale(locale.code)"
      >
        <span :class="isLocaleVisible(locale.code) ? 'i-ph-eye' : 'i-ph-eye-slash'" class="text-[13px] op-70" aria-hidden="true" />
        {{ locale.code }}
        <span v-if="locale.code === currentProject?.sourceLocale" class="badge">{{ t('overview.source') }}</span>
        <span v-else class="tabular-nums text-[10px]" :class="isLocaleVisible(locale.code) && (locale.percent >= 100 ? 'color-ok' : 'color-muted')">{{ formatPercent(locale.percent) }}</span>
        <span v-if="isLocaleVisible(locale.code)" class="absolute bottom-0 left-0 h-[2px] bg-[var(--x-fg)] op-40" :style="{ width: `${locale.percent}%` }" aria-hidden="true" />
      </button>
    </div>
    <div class="flex-auto" />
    <span class="font-mono text-[11px] color-muted tabular-nums">{{ t('localeBar.shown', { shown: visibleLocales.length, total: locales.length }) }}</span>
    <button v-if="visibleLocales.length < locales.length" type="button" class="btn-ghost h-7" @click="showAllLocales">
      {{ t('localeBar.showAll') }}
    </button>
  </div>
</template>

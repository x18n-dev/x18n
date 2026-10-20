<script setup lang="ts">
import { ref } from 'vue'
import { showFlags } from '../flags'
import { formatPercent, languageName, t } from '../i18n'
import { currentProject, isLocaleOrderCustom, isLocaleVisible, locales, moveLocale, resetLocaleOrder, showAllLocales, toggleLocale, visibleLocales } from '../state'
import LocaleFlag from './LocaleFlag.vue'

const dragged = ref<string>()
/** Where the dragged chip would land, as an index between chips. */
const dropAt = ref<number>()

function onDragStart(event: DragEvent, code: string): void {
  dragged.value = code
  // Firefox starts a drag only when it carries data.
  event.dataTransfer?.setData('text/plain', code)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, index: number): void {
  if (!dragged.value || !(event.currentTarget instanceof HTMLElement))
    return
  event.preventDefault()
  const { left, width } = event.currentTarget.getBoundingClientRect()
  dropAt.value = event.clientX < left + width / 2 ? index : index + 1
}

function onDrop(): void {
  const code = dragged.value
  const at = dropAt.value
  if (code !== undefined && at !== undefined) {
    const from = locales.value.findIndex(l => l.code === code)
    moveLocale(code, from < at ? at - 1 : at)
  }
  onDragEnd()
}

function onDragEnd(): void {
  dragged.value = undefined
  dropAt.value = undefined
}
</script>

<template>
  <div class="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5" role="toolbar" :aria-label="t('localeBar.bar')">
    <span class="label">{{ t('localeBar.title') }}</span>
    <div class="flex flex-wrap gap-1" @dragleave.self="dropAt = undefined">
      <button
        v-for="(locale, index) in locales"
        :key="locale.code"
        type="button"
        draggable="true"
        class="focus-ring h-7 flex cursor-grab items-center gap-1.5 border px-2 font-mono text-xs transition-colors active:cursor-grabbing"
        :class="[
          isLocaleVisible(locale.code) ? 'border-strong color-base hover:border-inverse' : 'border-dashed border-base color-faint hover:color-muted',
          dragged === locale.code && 'op-40',
          dropAt === index && 'shadow-[-3px_0_0_var(--x-fg)]',
          dropAt === index + 1 && index === locales.length - 1 && 'shadow-[3px_0_0_var(--x-fg)]',
        ]"
        :aria-pressed="isLocaleVisible(locale.code)"
        :title="[
          t('localeBar.toggle', { locale: languageName(locale.code) ?? locale.code }),
          locale.code === currentProject?.sourceLocale ? t('overview.source') : formatPercent(locale.percent),
          t('localeBar.reorder'),
        ].join('\n')"
        :data-locale-toggle="locale.code"
        @click="toggleLocale(locale.code)"
        @keydown.alt.left.prevent="moveLocale(locale.code, index - 1)"
        @keydown.alt.right.prevent="moveLocale(locale.code, index + 1)"
        @dragstart="onDragStart($event, locale.code)"
        @dragover="onDragOver($event, index)"
        @drop.prevent="onDrop"
        @dragend="onDragEnd"
      >
        <LocaleFlag v-if="showFlags" :code="locale.code" :class="!isLocaleVisible(locale.code) && 'grayscale op-50'" />
        <span v-else :class="isLocaleVisible(locale.code) ? 'i-ph-eye' : 'i-ph-eye-slash'" class="text-[13px] op-70" aria-hidden="true" />
        {{ locale.code }}
      </button>
    </div>
    <div class="flex-auto" />
    <span class="font-mono text-[11px] color-muted tabular-nums">{{ t('localeBar.shown', { shown: visibleLocales.length, total: locales.length }) }}</span>
    <button v-if="visibleLocales.length < locales.length" type="button" class="btn-ghost h-7" @click="showAllLocales">
      {{ t('localeBar.showAll') }}
    </button>
    <button v-if="isLocaleOrderCustom" type="button" class="btn-ghost h-7" @click="resetLocaleOrder">
      {{ t('localeBar.resetOrder') }}
    </button>
    <button type="button" class="btn-icon h-7 w-7" :aria-pressed="showFlags" :title="t('localeBar.flags')" @click="showFlags = !showFlags">
      <span :class="showFlags ? 'i-ph-flag-fill' : 'i-ph-flag'" />
    </button>
  </div>
</template>

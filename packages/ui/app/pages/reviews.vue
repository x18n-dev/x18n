<script setup lang="ts">
import type { ReviewState } from '@x18n/core'
import { computed, ref } from 'vue'
import { NuxtLink } from '#components'
import LocaleFlag from '../components/LocaleFlag.vue'
import MessageText from '../components/MessageText.vue'
import ReviewThread from '../components/ReviewThread.vue'
import UiPage from '../components/ui/UiPage.vue'
import UiToggle from '../components/ui/UiToggle.vue'
import { t } from '../i18n'
import { reviewStates } from '../review'
import { currentProject, useLive, visibleLocales } from '../state'

const threads = useLive((b, project) => b.reviews(project))
const table = useLive((b, project) => b.keys(project))
const values = computed(() => new Map((table.value?.rows ?? []).map(row => [row.key, row.values])))
const showResolved = ref(false)
const state = ref<ReviewState>()

const shown = computed(() => (threads.value ?? []).filter(thread =>
  (showResolved.value || thread.state !== undefined)
  && visibleLocales.value.some(l => l.code === thread.locale)))
const states = computed(() => {
  const counts = new Map<ReviewState, number>()
  for (const thread of shown.value) {
    if (thread.state)
      counts.set(thread.state, (counts.get(thread.state) ?? 0) + 1)
  }
  return [...counts]
})
const rows = computed(() => shown.value.filter(thread => !state.value || thread.state === state.value))
</script>

<template>
  <UiPage>
    <p v-if="currentProject?.reviews === undefined" class="border-b border-base px-4 py-3 color-muted">
      {{ t('review.off') }}
    </p>
    <template v-else-if="threads">
      <div class="flex flex-wrap items-center gap-2 border-b border-base px-4 py-3">
        <button type="button" class="btn h-7" :class="state ? 'btn-ghost' : 'border-strong'" @click="state = undefined">
          {{ t('review.all', { count: shown.length }) }}
        </button>
        <button
          v-for="[s, count] in states"
          :key="s"
          type="button"
          class="btn h-7 text-xs"
          :class="state === s ? 'border-strong' : 'btn-ghost'"
          @click="state = s"
        >
          <span :class="[reviewStates[s].icon, reviewStates[s].color]" />
          {{ t(reviewStates[s].label) }} <span class="tabular-nums color-muted">{{ count }}</span>
        </button>
        <span class="flex-auto" />
        <UiToggle v-model="showResolved">
          {{ t('review.showResolved') }}
        </UiToggle>
      </div>

      <div v-if="!rows.length" class="grid justify-items-center gap-2 border-b border-base px-4 py-12 color-muted">
        <span class="i-ph-chat-circle-dots-duotone text-2xl color-faint" />
        {{ t('review.empty') }}
      </div>
      <article v-for="thread in rows" :key="`${thread.key}:${thread.locale}`" class="grid grid-cols-[minmax(0,18rem)_1fr] gap-6 border-b border-base px-4 py-4 max-md:grid-cols-1" :data-thread="`${thread.key}:${thread.locale}`">
        <div class="grid content-start gap-2">
          <div class="flex items-center gap-2">
            <NuxtLink :to="`/keys/${encodeURIComponent(thread.key)}`" class="focus-ring truncate font-mono text-xs font-medium hover:underline" :title="thread.key">
              {{ thread.key }}
            </NuxtLink>
            <span class="flex-auto" />
            <span v-if="thread.state" class="badge shrink-0 gap-1 border-current" :class="reviewStates[thread.state].color">
              <span :class="reviewStates[thread.state].icon" /> {{ t(reviewStates[thread.state].label) }}
            </span>
          </div>
          <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
            <template v-if="currentProject && thread.locale !== currentProject.sourceLocale">
              <dt class="inline-flex items-center gap-1.5 font-mono text-xs color-muted">
                <LocaleFlag :code="currentProject.sourceLocale" />{{ currentProject.sourceLocale }}
              </dt>
              <dd class="min-w-0 color-muted">
                <MessageText :value="values.get(thread.key)?.[currentProject.sourceLocale]" />
              </dd>
            </template>
            <dt class="inline-flex items-center gap-1.5 font-mono text-xs">
              <LocaleFlag :code="thread.locale" />{{ thread.locale }}
            </dt>
            <dd class="min-w-0">
              <MessageText :value="values.get(thread.key)?.[thread.locale]" />
            </dd>
          </dl>
        </div>
        <ReviewThread :thread="thread" :current="values.get(thread.key)?.[thread.locale]" />
      </article>
    </template>
  </UiPage>
</template>

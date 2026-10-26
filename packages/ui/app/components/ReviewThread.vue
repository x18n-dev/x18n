<!-- The reviews of one message as a timeline, with apply and resolve. Resolved reviews fold away. -->
<script setup lang="ts">
import type { MessageLeaf, ReviewThread } from '@x18n/core'
import { computed, ref } from 'vue'
import { applyEdit } from '../edit'
import { formatAgo, t, uiLocale } from '../i18n'
import { reviewTypes } from '../review'
import { backend } from '../state'
import MessageText from './MessageText.vue'

const { thread, current } = defineProps<{
  thread: ReviewThread
  /** The message's value now, shown against a suggestion. */
  current?: MessageLeaf | undefined
}>()

const showResolved = ref(false)
const resolved = computed(() => thread.comments.filter(c => c.resolved).length)
const shown = computed(() => showResolved.value
  ? thread.comments
  : thread.comments.filter(c => !c.resolved))
const write = computed(() => backend.value?.capabilities.write === true)

function author(comment: ReviewThread['comments'][number]): string {
  return comment.author?.name ?? comment.author?.email ?? t('review.unknownAuthor')
}
</script>

<template>
  <div class="grid gap-2" :data-review-locale="thread.locale">
    <ol v-if="shown.length" class="grid gap-3 border-l border-base">
      <li v-for="comment in shown" :key="comment.id" class="group relative grid gap-1.5 pl-5" :class="comment.resolved && 'opacity-55'" :data-review="comment.id">
        <span class="absolute -left-[9px] top-0 size-[18px] flex items-center justify-center border border-base bg-base">
          <span class="text-[11px]" :class="[reviewTypes[comment.type].icon, reviewTypes[comment.type].color]" />
        </span>
        <div class="flex min-h-[18px] flex-wrap items-center gap-x-1.5 text-xs">
          <span class="font-medium color-base">{{ author(comment) }}</span>
          <span class="color-muted">{{ t(reviewTypes[comment.type].done) }}</span>
          <span class="color-faint">·</span>
          <time class="color-faint" :datetime="comment.time" :title="new Date(comment.time).toLocaleString(uiLocale)">{{ formatAgo(Date.parse(comment.time)) }}</time>
          <span v-if="comment.resolved" class="badge ml-1">{{ t('review.resolved') }}</span>
          <span v-if="comment.stale" class="badge ml-1 border-current color-warn">{{ t('review.stale') }}</span>
          <span class="flex-auto" />
          <button
            v-if="write && !comment.resolved"
            type="button"
            class="btn-icon h-6 w-6 text-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="t('review.resolve')"
            :title="t('review.resolve')"
            @click="applyEdit([{ type: 'resolve-review', id: comment.id }])"
          >
            <span class="i-ph-check" />
          </button>
        </div>
        <p v-if="comment.text" class="whitespace-pre-wrap break-words leading-relaxed">
          {{ comment.text }}
        </p>
        <div v-if="comment.suggestion !== undefined" class="grid grid-cols-[1fr_auto] items-center gap-3 border border-base bg-hover px-3 py-2">
          <div class="grid min-w-0 gap-1">
            <span v-if="current !== undefined && current !== null && current !== '' && current !== comment.suggestion" class="truncate text-xs color-faint line-through decoration-[var(--x-faint)]">
              <MessageText :value="current" inline />
            </span>
            <span class="min-w-0 font-medium"><MessageText :value="comment.suggestion" /></span>
          </div>
          <button v-if="write && !comment.resolved" type="button" class="btn-outline h-7" @click="applyEdit([{ type: 'apply-suggestion', id: comment.id }])">
            <span class="i-ph-check" /> {{ t('review.apply') }}
          </button>
        </div>
      </li>
    </ol>
    <button v-if="resolved" type="button" class="btn-ghost h-6 justify-self-start px-1.5 text-[11px]" @click="showResolved = !showResolved">
      <span :class="showResolved ? 'i-ph-caret-up' : 'i-ph-caret-down'" />
      {{ showResolved ? t('review.hideResolved') : t('review.resolvedCount', { count: resolved }) }}
    </button>
  </div>
</template>

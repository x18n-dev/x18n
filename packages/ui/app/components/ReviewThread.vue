<!-- The comments on one message, with resolve and apply; `composing` adds the form for a new review. -->
<script setup lang="ts">
import type { ReviewThread, ReviewType } from '@x18n/core'
import { computed, ref } from 'vue'
import { applyEdit } from '../edit'
import { formatAgo, t, uiLocale } from '../i18n'
import { reviewTypeOrder, reviewTypes } from '../review'
import { backend } from '../state'
import MessageText from './MessageText.vue'
import UiSegmented from './ui/UiSegmented.vue'

const { thread, reviewKey, locale, composing = false } = defineProps<{
  thread: ReviewThread | undefined
  reviewKey: string
  locale: string
  composing?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const type = ref<ReviewType>('comment')
const text = ref('')
const suggestion = ref('')
const types = computed(() => reviewTypeOrder.map(value => ({
  value,
  label: t(reviewTypes[value].label),
})))
const canSend = computed(() => type.value === 'suggestion'
  ? suggestion.value !== ''
  : type.value === 'approve' || text.value.trim() !== '')

async function send(): Promise<void> {
  await applyEdit([
    {
      type: 'review',
      key: reviewKey,
      locale,
      review: type.value,
      ...text.value.trim() && {
        text: text.value.trim(),
      },
      ...type.value === 'suggestion' && { suggestion: suggestion.value },
    },
  ])
  text.value = ''
  suggestion.value = ''
  emit('close')
}

function author(comment: ReviewThread['comments'][number]): string {
  return comment.author?.name ?? comment.author?.email ?? t('review.unknownAuthor')
}
</script>

<template>
  <div class="grid gap-2 border-l-2 border-base pl-3" :data-review-locale="locale">
    <div v-for="comment in thread?.comments" :key="comment.id" class="grid gap-1" :class="comment.resolved ? 'opacity-60' : ''" :data-review="comment.id">
      <div class="flex flex-wrap items-center gap-x-2 text-xs color-muted">
        <span class="color-base font-medium">{{ author(comment) }}</span>
        <span>{{ t(reviewTypes[comment.type].done) }}</span>
        <time :datetime="comment.time" :title="new Date(comment.time).toLocaleString(uiLocale)">{{ formatAgo(Date.parse(comment.time)) }}</time>
        <span v-if="comment.resolved" class="badge">{{ t('review.resolved') }}</span>
        <span v-if="comment.stale" class="badge border-current color-warn">{{ t('review.stale') }}</span>
        <span class="flex-auto" />
        <template v-if="backend?.capabilities.write && !comment.resolved">
          <button v-if="comment.type === 'suggestion'" class="btn-outline h-6 text-xs" @click="applyEdit([{ type: 'apply-suggestion', id: comment.id }])">
            <span class="i-ph-check" /> {{ t('review.apply') }}
          </button>
          <button class="btn-ghost h-6 text-xs" @click="applyEdit([{ type: 'resolve-review', id: comment.id }])">
            {{ t('review.resolve') }}
          </button>
        </template>
      </div>
      <p v-if="comment.text" class="whitespace-pre-wrap">
        {{ comment.text }}
      </p>
      <div v-if="comment.suggestion !== undefined" class="flex items-baseline gap-2">
        <span class="label">{{ t('review.suggests') }}</span>
        <MessageText :value="comment.suggestion" />
      </div>
    </div>

    <form v-if="composing && backend?.capabilities.write" class="grid gap-2 border border-inverse p-2" @submit.prevent="canSend && send()">
      <UiSegmented v-model="type" :options="types" :label="t('review.type')" />
      <input v-if="type === 'suggestion'" v-model="suggestion" class="input font-mono" :placeholder="t('review.suggestionPlaceholder')" :aria-label="t('review.suggestionPlaceholder')">
      <textarea v-model="text" class="input min-h-12 py-1.5 [field-sizing:content]" rows="2" :placeholder="t('review.textPlaceholder')" :aria-label="t('review.textPlaceholder')" @keydown.escape.prevent="emit('close')" />
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-ghost h-7" @click="emit('close')">
          {{ t('edit.cancel') }}
        </button>
        <button type="submit" class="btn-solid h-7" :disabled="!canSend">
          {{ t('review.send') }}
        </button>
      </div>
    </form>
  </div>
</template>

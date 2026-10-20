<script setup lang="ts">
import type { HistoryView } from '../../src/node/types'
import { formatAgo, t, uiLocale } from '../i18n'

defineProps<{ change: HistoryView }>()
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1.5 text-xs color-muted">
    <span class="i-ph-clock-counter-clockwise shrink-0" />
    <span v-if="change.at === null">{{ t('history.local') }}</span>
    <time v-else :datetime="new Date(change.at).toISOString()" :title="new Date(change.at).toLocaleString(uiLocale)">{{ formatAgo(change.at) }}</time>
    <code v-if="change.revision" class="font-mono" :title="change.revision">{{ change.revision.slice(0, 7) }}</code>
    <span v-if="change.author" class="truncate">{{ change.author }}</span>
  </span>
</template>

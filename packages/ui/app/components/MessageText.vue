<script setup lang="ts">
import type { MessageLeaf } from '@x18n/core'
import type { MessageView } from '../../src/node/types'
import { computed } from 'vue'
import { t } from '../i18n'

const props = defineProps<{
  value: MessageLeaf | undefined
  placeholders?: MessageView['placeholders']
  /** One line, for the grid's fixed-height rows. */
  inline?: boolean
}>()

/** The value split around its placeholders, so they can be highlighted. */
const parts = computed(() => {
  if (typeof props.value !== 'string')
    return []
  const out: { text: string, placeholder: boolean }[] = []
  let at = 0
  for (const ph of props.placeholders ?? []) {
    if (ph.start > at)
      out.push({ text: props.value.slice(at, ph.start), placeholder: false })
    out.push({ text: props.value.slice(ph.start, ph.end), placeholder: true })
    at = ph.end
  }
  if (at < props.value.length)
    out.push({ text: props.value.slice(at), placeholder: false })
  return out
})
</script>

<template>
  <span v-if="value === undefined" class="font-mono text-[11px] uppercase tracking-[0.08em] color-error op-80">{{ t('value.missing') }}</span>
  <span v-else-if="value === ''" class="font-mono text-[11px] uppercase tracking-[0.08em] color-warn op-80">{{ t('value.empty') }}</span>
  <span v-else-if="typeof value !== 'string'" class="font-mono color-info">{{ JSON.stringify(value) }}</span>
  <span v-else :class="inline ? 'whitespace-nowrap' : 'whitespace-pre-wrap break-words'"><template v-for="(part, i) in parts" :key="i"><span v-if="part.placeholder" class="border-b border-current font-mono color-info" data-placeholder>{{ part.text }}</span><template v-else>{{ part.text }}</template></template></span>
</template>

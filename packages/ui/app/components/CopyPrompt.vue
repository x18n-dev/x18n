<script setup lang="ts">
import type { PromptQuery } from '../../src/node/types'
import { ref } from 'vue'
import { t } from '../i18n'
import { backend } from '../state'

const props = defineProps<{ query: PromptQuery, label?: string | undefined }>()
const copied = ref(false)

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(await backend.value!.translatePrompt(props.query))
  copied.value = true
  setTimeout(() => copied.value = false, 1500)
}
</script>

<template>
  <button v-if="backend?.capabilities.prompts" class="btn-outline h-7" :title="query.stale ? t('prompt.staleHint') : t('prompt.hint')" @click="copy">
    <span :class="copied ? 'i-ph-check' : 'i-ph-clipboard-text'" />
    {{ copied ? t('prompt.copied') : label ?? t('prompt.copy') }}
  </button>
</template>

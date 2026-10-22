<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { t } from '../i18n'

defineProps<{
  label: string
  /** Why the last save was refused; offers saving anyway. */
  problem?: string | undefined
}>()
const emit = defineEmits<{ save: [force: boolean], cancel: [] }>()
const draft = defineModel<string>({ required: true })
const field = useTemplateRef<HTMLTextAreaElement>('field')

onMounted(() => {
  const el = field.value!
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
})
</script>

<template>
  <div class="border border-inverse bg-base" role="group" :aria-label="label">
    <textarea
      ref="field"
      v-model="draft"
      class="block min-h-16 w-full resize-none bg-transparent px-3 py-2 font-mono text-sm outline-none [field-sizing:content]"
      rows="2"
      :aria-label="label"
      @keydown.enter.exact.prevent="emit('save', false)"
      @keydown.escape.prevent="emit('cancel')"
    />
    <div v-if="problem" class="flex items-center gap-2 border-t border-base px-3 py-1.5 text-xs color-warn" role="alert">
      <span class="i-ph-warning-duotone shrink-0" />
      <span class="flex-auto">{{ problem }}</span>
      <button class="btn-outline h-7" @click="emit('save', true)">
        {{ t('edit.saveAnyway') }}
      </button>
    </div>
    <div class="flex items-center gap-2 border-t border-base py-1 pl-3 pr-1">
      <span class="flex-auto font-mono text-[11px] color-faint">{{ t('edit.hint') }}</span>
      <button class="btn-ghost h-7" @click="emit('cancel')">
        <span class="i-ph-x" /> {{ t('edit.cancel') }}
      </button>
      <button class="btn-solid h-7" @click="emit('save', false)">
        <span class="i-ph-check" /> {{ t('edit.save') }}
      </button>
    </div>
  </div>
</template>

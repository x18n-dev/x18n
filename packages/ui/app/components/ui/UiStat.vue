<script setup lang="ts">
import { uiLocale } from '../../i18n'

defineProps<{
  label: string
  value: number
}>()
</script>

<template>
  <div class="flex flex-col gap-1 px-4 py-3">
    <span class="font-mono text-2xl tabular-nums">{{ value.toLocaleString(uiLocale) }}</span>
    <span class="label">{{ label }}</span>
  </div>
</template>

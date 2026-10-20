<script setup lang="ts">
defineProps<{
  label: string
  value: number
}>()
</script>

<template>
  <div class="flex flex-col gap-1 px-4 py-3">
    <span class="font-mono text-2xl tabular-nums">{{ value.toLocaleString('en') }}</span>
    <span class="label">{{ label }}</span>
  </div>
</template>

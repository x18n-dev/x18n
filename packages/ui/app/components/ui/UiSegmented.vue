<script setup lang="ts" generic="T extends string">
defineProps<{
  options: readonly { value: T, label: string }[]
  /** Accessible name of the group. */
  label: string
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="tablist" :aria-label="label" class="inline-flex w-fit border border-strong">
    <button
      v-for="(option, i) in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="model === option.value"
      class="focus-ring h-8 px-3 text-xs font-medium transition-colors"
      :class="[
        model === option.value ? 'bg-inverse color-inverse' : 'color-muted hover:color-base hover:bg-hover',
        i > 0 && 'border-l border-strong',
      ]"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

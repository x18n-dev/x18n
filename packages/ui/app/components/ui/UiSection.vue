<script setup lang="ts">
import UiCross from './UiCross.vue'

defineProps<{
  /** Mono index, like `02`. */
  index?: string
  title: string
}>()
</script>

<template>
  <section class="relative border-b border-base">
    <UiCross class="-left-[6px] -bottom-[6px]" />
    <UiCross class="-right-[6px] -bottom-[6px]" />
    <header class="flex min-h-10 items-center gap-3 border-b border-base px-4 py-2">
      <span v-if="index" class="label color-faint">{{ index }}</span>
      <h2 class="label color-base">
        {{ title }}
      </h2>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>

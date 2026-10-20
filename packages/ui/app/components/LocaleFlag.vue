<!-- The round flag of a locale. A project locale takes core's flag, which `localeInfo` in the config can set. -->
<script setup lang="ts">
import { computed } from 'vue'
import { flagSource, regionOfFlag, showFlags } from '../flags'
import { locales } from '../state'

const { code } = defineProps<{ code: string }>()

function regionOf(tag: string): string | undefined {
  const flag = locales.value.find(l => l.code === tag)?.flag
  if (flag)
    return regionOfFlag(flag)
  try {
    return new Intl.Locale(tag).maximize().region
  }
  catch {
    return undefined
  }
}

const source = computed(() => {
  const region = showFlags.value ? regionOf(code) : undefined
  return region && flagSource(region)
})
</script>

<template>
  <img v-if="source" :src="source" alt="" class="size-[1.1em] shrink-0 select-none" draggable="false" data-flag>
</template>

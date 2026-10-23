<!-- The round flag of a locale. A project locale takes core's flag, which `localeInfo` in the config can set; locales without a country show their language icon. -->
<script setup lang="ts">
import { computed } from 'vue'
import { flagCandidates, flagSource, showFlags } from '../flags'
import { locales } from '../state'

const { code } = defineProps<{ code: string }>()

const source = computed(() =>
  showFlags.value
    ? flagSource(flagCandidates(code, locales.value.find(l => l.code === code)?.flag))
    : undefined)
</script>

<template>
  <img v-if="source" :src="source" alt="" class="size-[1.1em] shrink-0 select-none" draggable="false" data-flag>
</template>

<!-- Adapted from @antfu/design (MIT), `components/Display/DisplayFileIcon.vue`. -->
<script setup lang="ts">
import { computed } from 'vue'
import { getFileType } from '../file-icon'

const props = defineProps<{ path: string }>()
const type = computed(() => getFileType(props.path))
</script>

<template>
  <span class="icon-catppuccin shrink-0" :class="type.icon" :title="type.name" aria-hidden="true" />
</template>

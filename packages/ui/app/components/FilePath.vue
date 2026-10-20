<!-- Adapted from @antfu/design (MIT), `components/Display/DisplayFilePath.vue`: a project-relative path with its file icon, the directory dimmed. -->
<script setup lang="ts">
import { computed } from 'vue'
import FileIcon from './FileIcon.vue'

const { path, icon = true } = defineProps<{
  path: string
  line?: number | undefined
  column?: number | undefined
  icon?: boolean
}>()

const parts = computed(() => {
  const at = path.lastIndexOf('/') + 1
  return { dir: path.slice(0, at), base: path.slice(at) }
})
</script>

<template>
  <span class="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs" :title="path">
    <FileIcon v-if="icon" :path="path" />
    <span class="truncate"><span class="color-faint">{{ parts.dir }}</span><span class="color-base">{{ parts.base }}</span><span v-if="line !== undefined" class="color-faint">:{{ line }}<template v-if="column !== undefined">:{{ column }}</template></span></span>
  </span>
</template>

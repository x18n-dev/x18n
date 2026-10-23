<!-- Adapted from @antfu/design (MIT), `components/Display/DisplayFilePath.vue`: a project-relative path with its file icon, the directory dimmed. Opens in the editor on click when the server can. -->
<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'
import { canOpenInEditor as openable, openInEditor } from '../open'
import FileIcon from './FileIcon.vue'

const { path, line, column, icon = true } = defineProps<{
  path: string
  line?: number | undefined
  column?: number | undefined
  icon?: boolean
}>()

const parts = computed(() => {
  const at = path.lastIndexOf('/') + 1
  return {
    dir: path.slice(0, at),
    base: path.slice(at),
  }
})

function open(event: Event): void {
  // Paths often sit inside links and rows; opening the file must not also navigate.
  event.preventDefault()
  event.stopPropagation()
  openInEditor(path, line, column)
}
</script>

<template>
  <component
    :is="openable ? 'button' : 'span'"
    :type="openable ? 'button' : undefined"
    class="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs"
    :class="openable && 'focus-ring cursor-pointer text-left hover:underline'"
    :title="openable ? `${t('detail.openInEditor')}: ${path}` : path"
    @click="openable && open($event)"
  >
    <FileIcon v-if="icon" :path="path" />
    <span class="truncate"><span class="color-faint">{{ parts.dir }}</span><span class="color-base">{{ parts.base }}</span><span v-if="line !== undefined" class="color-faint">:{{ line }}<template v-if="column !== undefined">:{{ column }}</template></span></span>
  </component>
</template>

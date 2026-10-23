<script setup lang="ts">
import type { UsageView } from '../../src/node/types'
import { t } from '../i18n'
import { canOpenInEditor, openInEditor } from '../open'

const props = defineProps<{ usage: UsageView }>()

/** Opens the clicked line, unless the click ended a text selection. */
function open(line: number, column: number): void {
  if (!window.getSelection()?.toString())
    openInEditor(props.usage.path, line, column)
}

/** The line of the usage split around the key text. */
function split(text: string): { before: string, hit: string, after: string } {
  const start = props.usage.column - 1
  // Older servers send no length; the key as written is what the range covers.
  const end = Math.min(text.length, start + (props.usage.length ?? props.usage.raw.length))
  return {
    before: text.slice(0, start),
    hit: text.slice(start, end),
    after: text.slice(end),
  }
}
</script>

<template>
  <pre class="of-x-auto border border-base py-1 font-mono text-xs leading-5"><code><span
    v-for="(text, i) in usage.snippet.lines"
    :key="i"
    class="block pr-3"
    :class="[usage.snippet.line + i === usage.line ? 'bg-hover color-base' : 'color-muted', canOpenInEditor && 'cursor-pointer hover:bg-hover']"
    :title="canOpenInEditor ? t('detail.openInEditor') : undefined"
    @click="open(usage.snippet.line + i, usage.snippet.line + i === usage.line ? usage.column : 1)"
  ><span class="inline-block w-10 select-none pr-3 text-right tabular-nums color-faint" :class="usage.snippet.line + i === usage.line && 'shadow-[inset_2px_0_var(--x-fg)]'">{{ usage.snippet.line + i }}</span><template v-if="usage.snippet.line + i === usage.line">{{ split(text).before }}<mark class="bg-teal:10 px0.5 py0.1 rounded border border-teal:50 text-teal-700 dark:text-teal-200" data-usage-key>{{ split(text).hit }}</mark>{{ split(text).after }}</template><template v-else>{{ text }}</template></span></code></pre>
</template>

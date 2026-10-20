<script setup lang="ts">
import type { UsageView } from '../../src/node/types'

defineProps<{ usage: UsageView }>()
</script>

<template>
  <pre class="of-x-auto border border-base py-1 font-mono text-xs leading-5"><code><span
    v-for="(text, i) in usage.snippet.lines"
    :key="i"
    class="block pr-3"
    :class="usage.snippet.line + i === usage.line ? 'bg-hover color-base' : 'color-muted'"
  ><span class="inline-block w-10 select-none pr-3 text-right tabular-nums color-faint" :class="usage.snippet.line + i === usage.line && 'shadow-[inset_2px_0_var(--x-fg)]'">{{ usage.snippet.line + i }}</span>{{ text }}</span></code></pre>
</template>

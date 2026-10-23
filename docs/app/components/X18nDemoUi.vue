<script setup lang="ts">
const emit = defineEmits<{ start: [ms: number], done: [] }>()
const locales = [
  {
    code: 'en',
    flag: 'us',
    value: 'Filter keys',
    source: true,
  },
  { code: 'ja', flag: 'jp', value: 'キーを絞り込む' },
  { code: 'zh-Hans', flag: 'cn', value: '筛选键' },
  { code: 'de', flag: 'de', value: 'Schlüssel filtern' },
  { code: 'fr', flag: 'fr', value: 'Filtrer les clés' },
]
// Messages that stay missing until the demo "translates" them.
const missing = ['ja', 'fr']

const tree = [
  { name: 'app', open: false },
  { name: 'auth', open: false },
  {
    name: 'sidebar',
    open: true,
    children: ['filter', 'list', 'tree'],
  },
  { name: 'usages', open: false },
]

const selected = ref('filter')
const typed = ref<Record<string, string>>({})
const editing = ref('')

const usage = {
  prev: '  <KeyHeader :count="total" />',
  next: '  <KeyTree v-model="key" />',
  file: 'src/components/',
  name: 'KeySidebar.vue',
  pos: '12:28',
  before: `  <UInput :placeholder="t('`,
  after: `')" />`,
}

const isMissing = (code: string) => missing.includes(code) && typed.value[code] !== locales.find(l => l.code === code)!.value

useDemoLoop(async (sleep) => {
  selected.value = 'list'
  typed.value = {}
  editing.value = ''
  await sleep(1600)
  selected.value = 'filter'
  await sleep(1400)
  for (const code of missing) {
    const value = locales.find(l => l.code === code)!.value
    editing.value = code
    await sleep(500)
    for (const char of value) {
      typed.value = { ...typed.value, [code]: (typed.value[code] ?? '') + char }
      await sleep(70)
    }
    await sleep(400)
    editing.value = ''
    await sleep(600)
  }
  await sleep(5000)
}, () => {
  typed.value = Object.fromEntries(missing.map(c => [c, locales.find(l => l.code === c)!.value]))
}, {
  start: ms => emit('start', ms),
  done: () => emit('done'),
})
</script>

<template>
  <div class="flex h-full flex-col font-mono text-xs">
    <div class="flex items-center gap-1.5 border-b border-muted px-4 py-2">
      <span class="mr-2 text-muted">Locales</span>
      <span
        v-for="l in locales"
        :key="l.code"
        class="flex items-center gap-1.5 border border-muted px-2 py-0.5 text-highlighted"
      >
        <UIcon :name="`i-circle-flags-${l.flag}`" class="size-3.5" />
        {{ l.code }}
        <span v-if="isMissing(l.code)" class="size-1.5 rounded-full bg-warning" />
      </span>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="w-48 shrink-0 border-r border-muted">
        <div class="flex items-center justify-between px-3 py-2 text-muted">
          <span>Keys <span class="ml-1 opacity-60">137</span></span>
          <UIcon name="i-ph-tree-structure-duotone" class="size-4" />
        </div>
        <div class="mx-3 mb-2 border border-muted px-2 py-1 text-muted">
          Filter keys
        </div>
        <div v-for="node in tree" :key="node.name">
          <div class="flex items-center gap-2 px-3 py-1 text-toned">
            <UIcon :name="node.open ? 'i-ph-caret-down-duotone' : 'i-ph-caret-right-duotone'" class="size-3" />
            {{ node.name }}
          </div>
          <div
            v-for="child in node.children"
            :key="child"
            class="border-l-2 py-1 pl-[1.875rem] transition-colors"
            :class="selected === child ? 'border-primary bg-elevated text-highlighted' : 'border-transparent text-toned'"
          >
            {{ child }}
          </div>
        </div>
      </div>

      <div class="min-w-0 flex-1 overflow-hidden">
        <div>
          <div class="border-b border-muted px-5 py-3">
            <div class="text-muted">
              Key
            </div>
            <div class="text-lg text-highlighted">
              sidebar.{{ selected }}
            </div>
          </div>
          <div class="border-b border-muted px-5 py-2 text-muted">
            01 Values
          </div>
          <div
            v-for="l in locales"
            :key="l.code"
            class="flex items-center gap-4 border-b border-muted px-5 py-2.5"
          >
            <span class="flex w-24 shrink-0 items-center gap-2 text-sm text-highlighted">
              <UIcon :name="`i-circle-flags-${l.flag}`" class="size-4" />
              {{ l.code }}
            </span>
            <span
              class="min-w-0 flex-1 truncate text-sm"
              :class="editing === l.code ? 'text-highlighted' : 'text-toned'"
            >
              <template v-if="!isMissing(l.code) || editing === l.code">
                {{ missing.includes(l.code) ? typed[l.code] : l.value }}<span v-if="editing === l.code" class="ui-caret">|</span>
              </template>
              <span v-else class="text-warning">missing</span>
            </span>
            <span v-if="l.source" class="border border-muted px-1.5 py-0.5 text-[10px] text-muted">source</span>
          </div>
          <div class="border-b border-muted px-5 py-2 text-muted">
            02 Usages (1)
          </div>
          <div class="px-5 py-3">
            <div class="mb-2 flex items-center gap-2 text-muted">
              <UIcon name="i-catppuccin-vue" class="size-4" />
              <span>{{ usage.file }}<span class="text-highlighted">{{ usage.name }}</span>:{{ usage.pos }}</span>
            </div>
            <div class="overflow-hidden whitespace-pre border border-muted text-[11px] leading-5 text-toned">
              <div class="flex border-l-2 border-transparent">
                <span class="w-8 shrink-0 pr-3 text-right text-muted">11</span>{{ usage.prev }}
              </div>
              <div class="flex border-l-2 border-primary bg-elevated items-center">
                <span class="w-8 shrink-0 pr-3 text-right text-muted">12</span>{{ usage.before }}<span class="bg-teal-400/10 px-0.5 py-0.1 rounded border border-teal-400/50 text-teal-700 dark:text-teal-200">sidebar.filter</span>{{ usage.after }}
              </div>
              <div class="flex border-l-2 border-transparent">
                <span class="w-8 shrink-0 pr-3 text-right text-muted">13</span>{{ usage.next }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-caret {
  animation: blink 1s steps(1) infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}
</style>

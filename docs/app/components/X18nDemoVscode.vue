<script setup lang="ts">
type Token = [text: string, cls?: string] | { key: string }

const emit = defineEmits<{ start: [ms: number], done: [] }>()

// `missing` keys have no value and show as a warning.
const keys: Record<string, { id: string, values: Record<string, string>, missing?: boolean }> = {
  title: {
    id: 'welcome.title',
    values: { 'zh-Hans': '欢迎回来,{{name}}', 'ja': 'おかえりなさい、{{name}}', 'fr': 'Bon retour, {{name}}' },
  },
  subtitle: {
    id: 'welcome.subtitle',
    values: { 'zh-Hans': '查看你的消息', 'ja': 'メッセージを確認', 'fr': 'Vérifiez vos messages' },
  },
  save: { id: 'actions.sve', values: {}, missing: true },
}

const displayLocales = [
  { code: 'zh-Hans' },
  { code: 'ja' },
  { code: 'fr' },
]
const displayLocale = ref(displayLocales[0]!)
const valueOf = (key: string) => keys[key]!.values[displayLocale.value.code] ?? ''

const locales = [
  { code: 'en', flag: 'us', value: 'Welcome back, {{name}}' },
  { code: 'de', flag: 'de', value: 'Willkommen zurück, {{name}}' },
  { code: 'fr', flag: 'fr', value: 'Bon retour, {{name}}' },
  { code: 'ja', flag: 'jp', value: 'おかえりなさい、{{name}}' },
  { code: 'zh-Hans', flag: 'cn', value: '欢迎回来,{{name}}' },
]

// Dark+ token colors.
const text = 'text-(--vs-text)'
const ctrl = 'text-(--vs-ctrl)'
const decl = 'text-(--vs-decl)'
const type = 'text-(--vs-type)'
const vari = 'text-(--vs-var)'
const fn = 'text-(--vs-fn)'
const str = 'text-(--vs-str)'

const lines: Token[][] = [
  [
    ['import', ctrl],
    [' { ', text],
    ['useTranslation', fn],
    [' } ', text],
    ['from', ctrl],
    [' \'react-i18next\'', str],
  ],
  [],
  [
    ['export', ctrl],
    [' function ', decl],
    ['Welcome', fn],
    ['({ ', text],
    ['user', vari],
    [' }: ', text],
    ['Props', type],
    [') {', text],
  ],
  [
    ['  const', decl],
    [' { ', text],
    ['t', vari],
    [' } = ', text],
    ['useTranslation', fn],
    ['()', text],
  ],
  [],
  [
    ['  return', ctrl],
    [' (', text],
  ],
  [
    ['    <', text],
    ['header', decl],
    ['>', text],
  ],
  [
    ['      <', text],
    ['h1', decl],
    ['>{', text],
    ['t', fn],
    ['(\'', text],
    { key: 'title' },
    ['\', { ', text],
    ['name', vari],
    [': ', text],
    ['user', vari],
    ['.', text],
    ['name', vari],
    [' })}</', text],
    ['h1', decl],
    ['>', text],
  ],
  [
    ['      <', text],
    ['p', decl],
    ['>{', text],
    ['t', fn],
    ['(\'', text],
    { key: 'subtitle' },
    ['\')}</', text],
    ['p', decl],
    ['>', text],
  ],
  [
    ['      <', text],
    ['button', decl],
    ['>{', text],
    ['t', fn],
    ['(\'', text],
    { key: 'save' },
    ['\')}</', text],
    ['button', decl],
    ['>', text],
  ],
  [
    ['    </', text],
    ['header', decl],
    ['>', text],
  ],
  [
    ['  )', text],
  ],
  [
    ['}', text],
  ],
]

const cursorLine = ref(0)
const hover = ref(false)

useDemoLoop(async (sleep) => {
  cursorLine.value = 0
  hover.value = false
  displayLocale.value = displayLocales[0]!
  await sleep(1800)
  // The cursor line shows the raw key.
  cursorLine.value = 8
  await sleep(1600)
  cursorLine.value = 0
  await sleep(600)
  // Switch the display locale; every value follows.
  for (const locale of displayLocales.slice(1)) {
    await sleep(1500)
    displayLocale.value = locale
  }
  await sleep(1500)
  hover.value = true
  await sleep(4000)
  hover.value = false
  await sleep(600)
}, () => {
  hover.value = true
}, {
  start: ms => emit('start', ms),
  done: () => emit('done'),
})
</script>

<template>
  <div class="x18n-vscode relative flex h-full flex-col bg-(--vs-bg) font-mono text-[13px] leading-6 text-(--vs-fg)">
    <div class="flex min-h-0 flex-1">
      <div class="flex w-12 shrink-0 flex-col items-center gap-5 border-r border-(--vs-border) bg-(--vs-side) pt-4 text-(--vs-muted)">
        <UIcon name="i-ph-files-duotone" class="size-6 text-(--vs-fg)" />
        <UIcon name="i-ph-magnifying-glass-duotone" class="size-6" />
        <UIcon name="i-ph-git-branch-duotone" class="size-6" />
        <UIcon name="i-ph-bug-duotone" class="size-6" />
        <UIcon name="i-ph-squares-four-duotone" class="size-6" />
      </div>

      <div class="relative flex min-w-0 flex-1 flex-col">
        <div class="flex h-9 shrink-0 border-b border-(--vs-border) bg-(--vs-side) font-sans text-[13px]">
          <div class="flex items-center gap-2 border-t border-t-[#0078d4] bg-(--vs-bg) px-3 text-(--vs-fg)">
            <UIcon name="i-catppuccin-typescript-react" class="size-4" />
            Welcome.tsx
            <UIcon name="i-ph-x" class="ml-2 size-3.5" />
          </div>
        </div>

        <div class="flex items-center gap-1.5 px-4 py-1 font-sans text-xs text-(--vs-muted)">
          src <UIcon name="i-ph-caret-right-duotone" class="size-3" /> components <UIcon name="i-ph-caret-right-duotone" class="size-3" />
          <UIcon name="i-catppuccin-typescript-react" class="size-3.5" /> Welcome.tsx
        </div>

        <div class="flex-1 overflow-hidden pt-1">
          <div
            v-for="(line, i) in lines"
            :key="i"
            class="relative flex min-h-6 whitespace-pre"
            :class="cursorLine === i ? 'bg-(--vs-line)' : ''"
          >
            <span
              class="w-12 shrink-0 select-none pr-5 text-right"
              :class="cursorLine === i ? 'text-(--vs-fg)' : 'text-(--vs-linenum)'"
            >{{ i + 1 }}</span>
            <template v-for="(part, j) in line" :key="j">
              <span v-if="Array.isArray(part)" :class="part[1]">{{ part[0] }}</span>
              <template v-else>
                <span class="relative">
                  <!-- In place, and not on the cursor line: the value replaces the key. -->
                  <span
                    v-if="cursorLine !== i && !keys[part.key]!.missing"
                    class="rounded-sm bg-(--vs-chip) px-0.5 text-(--vs-str)"
                  >{{ valueOf(part.key) }}</span>
                  <span
                    v-else
                    :class="keys[part.key]!.missing ? 'text-(--vs-str) underline decoration-wavy decoration-[#cca700]' : 'text-(--vs-str)'"
                  >{{ keys[part.key]!.id }}</span>

                  <Transition name="fade">
                    <div
                      v-if="hover && part.key === 'title'"
                      class="absolute left-0 top-7 z-10 whitespace-nowrap border border-(--vs-widget-border) bg-(--vs-widget) px-3 py-2 shadow-xl"
                    >
                      <div v-for="l in locales" :key="l.code" class="flex items-center gap-3 leading-6">
                        <UIcon :name="`i-circle-flags-${l.flag}`" class="size-4 shrink-0" />
                        <span class="w-16 text-(--vs-fg)">{{ l.code }}</span>
                        <span class="font-sans text-(--vs-fg)">{{ l.value }}</span>
                      </div>
                    </div>
                  </Transition>
                </span>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="flex h-6 shrink-0 items-center justify-between border-t border-(--vs-border) bg-(--vs-side) pr-3 font-sans text-xs text-(--vs-fg)">
      <div class="flex h-full items-center gap-3">
        <span class="flex h-full w-9 items-center justify-center bg-[#0078d4] text-white"><UIcon name="i-ph-arrows-left-right" class="size-3.5" /></span>
        <span class="flex items-center gap-1"><UIcon name="i-ph-x-circle" class="size-3.5" />0</span>
        <span class="flex items-center gap-1"><UIcon name="i-ph-warning-duotone" class="size-3.5" />1</span>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1"><UIcon name="i-ph-globe-duotone" class="size-3.5" />en</span>
        <span class="flex items-center gap-1">
          <UIcon name="i-ph-eye-duotone" class="size-3.5" />{{ displayLocale.code }}
        </span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span class="flex items-center gap-1"><UIcon name="i-ph-brackets-curly-duotone" class="size-3.5" />TypeScript React</span>
        <UIcon name="i-ph-bell-duotone" class="size-3.5" />
      </div>
    </div>
  </div>
</template>

<style>
/* Light Modern by default, a darker Dark Modern under `.dark`. */
.x18n-vscode {
  --vs-bg: #ffffff;
  --vs-side: #f8f8f8;
  --vs-border: #e5e5e5;
  --vs-fg: #3b3b3b;
  --vs-muted: #6e7681;
  --vs-linenum: #8a8a8a;
  --vs-line: rgb(0 0 0 / 0.04);
  --vs-chip: rgb(0 0 0 / 0.07);
  --vs-widget: #f3f3f3;
  --vs-widget-border: #c8c8c8;
  --vs-text: #3b3b3b;
  --vs-ctrl: #af00db;
  --vs-decl: #0000ff;
  --vs-type: #267f99;
  --vs-var: #001080;
  --vs-fn: #795e26;
  --vs-str: #a31515;
}
.dark .x18n-vscode {
  --vs-bg: #141414;
  --vs-side: #0f0f0f;
  --vs-border: #232323;
  --vs-fg: #cccccc;
  --vs-muted: #858585;
  --vs-linenum: #6e7681;
  --vs-line: rgb(255 255 255 / 0.04);
  --vs-chip: rgb(255 255 255 / 0.1);
  --vs-widget: #1b1b1b;
  --vs-widget-border: #454545;
  --vs-text: #d4d4d4;
  --vs-ctrl: #c586c0;
  --vs-decl: #569cd6;
  --vs-type: #4ec9b0;
  --vs-var: #9cdcfe;
  --vs-fn: #dcdcaa;
  --vs-str: #ce9178;
}
</style>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

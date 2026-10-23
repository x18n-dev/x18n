<script setup lang="ts">
const emit = defineEmits<{ start: [ms: number], done: [] }>()

const command = 'pnpx @x18n/cli check'

interface Block {
  path: string
  pos: string
  level: 'error' | 'warning'
  rule: string
  text: string
  /** Code frame: the middle line is the one the marker sits under. */
  frame: [from: number, lines: [string, string, string]]
  mark: string
}

// Each block appears as one step, like the output of a real run.
const blocks: Block[] = [
  {
    path: 'src/App.vue',
    pos: '17:15',
    level: 'error',
    rule: 'missing-key',
    text: '"app.titel" is not defined in en.',
    frame: [
      16,
      ['  <main>', `    <p>{{ $t('app.titel') }}</p>`, '  </main>'],
    ],
    mark: `${' '.repeat(14)}${'~'.repeat(9)}`,
  },
  {
    path: 'src/locales/en.json',
    pos: '18:4',
    level: 'warning',
    rule: 'unused-key',
    text: '"unused" is not used.',
    frame: [
      17,
      ['  "app.save": "Save",', '  "unused": "Nobody uses me",', '  "app.title": "Welcome back"'],
    ],
    mark: `${' '.repeat(3)}${'~'.repeat(6)}`,
  },
]

const typed = ref(command)
const running = ref(false)
const shown = ref(blocks.length + 1)

useDemoLoop(async (sleep) => {
  typed.value = ''
  running.value = false
  shown.value = 0
  await sleep(700)
  for (const char of command) {
    typed.value += char
    await sleep(55)
  }
  await sleep(450)
  running.value = true
  await sleep(1100)
  running.value = false
  for (let i = 1; i <= blocks.length + 1; i++) {
    shown.value = i
    await sleep(i <= blocks.length
      ? 650
      : 0)
  }
  await sleep(5000)
}, undefined, {
  start: ms => emit('start', ms),
  done: () => emit('done'),
})

function tone(level: Block['level']) {
  return level === 'error'
    ? 'text-red-600 dark:text-red-400'
    : 'text-yellow-700 dark:text-yellow-400'
}
function badge(level: Block['level']) {
  return level === 'error'
    ? 'bg-red-500/15 text-red-700 dark:text-red-300'
    : 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300'
}
</script>

<template>
  <div class="h-full overflow-hidden bg-white p-5 font-mono text-[13px] leading-6 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
    <div class="flex items-center gap-2.5">
      <span class="text-emerald-600 dark:text-emerald-400">❯</span>
      <span>{{ typed }}<span v-if="shown === 0 && !running" class="cli-caret">▍</span></span>
    </div>

    <div v-if="running" class="mt-3 flex items-center gap-2 text-neutral-500">
      <UIcon name="i-ph-spinner-duotone" class="size-4 animate-spin" />
      Checking 5 locales, 6 resources, 137 keys
    </div>

    <div class="mt-4 space-y-4">
      <template v-for="(b, i) in blocks" :key="b.path">
        <div v-if="shown > i" class="cli-in">
          <div>
            <span class="text-cyan-700 underline decoration-cyan-700/40 underline-offset-2 dark:text-cyan-400 dark:decoration-cyan-400/40">{{ b.path }}</span><span class="text-neutral-500">:{{ b.pos }}</span>
          </div>
          <div class="mt-0.5 flex items-center gap-2">
            <span class="rounded px-1.5 text-xs font-semibold uppercase" :class="badge(b.level)">{{ b.level }}</span>
            <span>{{ b.text }}</span>
            <span class="ml-auto text-neutral-500">{{ b.rule }}</span>
          </div>
          <div class="mt-1.5 overflow-hidden whitespace-pre border-l-2 border-neutral-300 pl-3 text-xs leading-5 dark:border-neutral-700">
            <div v-for="(line, j) in b.frame[1]" :key="j">
              <span class="text-neutral-400 dark:text-neutral-600">{{ String(b.frame[0] + j).padStart(2) }} │ </span><span :class="j === 1 ? '' : 'text-neutral-500'">{{ line }}</span>
              <div v-if="j === 1" :class="tone(b.level)">
                <span class="text-neutral-400 dark:text-neutral-600">{{ '   │ ' }}</span>{{ b.mark }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="shown > blocks.length" class="cli-in mt-5 flex items-center gap-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <span class="font-semibold text-red-600 dark:text-red-400">✖ 1 error</span>
      <span class="font-semibold text-yellow-700 dark:text-yellow-400">⚠ 1 warning</span>
      <span class="ml-auto text-neutral-500">2 files · 96ms</span>
    </div>
  </div>
</template>

<style scoped>
.cli-caret {
  animation: blink 1s steps(1) infinite;
}
.cli-in {
  animation: fade-in 0.25s ease-out;
}
@keyframes blink {
  50% { opacity: 0; }
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(3px); }
}
</style>

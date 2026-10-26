<script setup lang="ts">
// A terminal that types a command and prints its output line by line, for the
// quick start tabs. It replays each time its tab becomes visible.
type Seg = string | [text: string, cls: string]
type Line = Seg[]

const props = defineProps<{ name: 'status' | 'check' | 'get' | 'search' | 'rename' | 'ui' | 'init' }>()

const c = {
  path: 'text-cyan-700 underline decoration-cyan-700/40 underline-offset-2 dark:text-cyan-400 dark:decoration-cyan-400/40',
  dim: 'text-neutral-500',
  faint: 'text-neutral-400 dark:text-neutral-600',
  key: 'font-semibold text-violet-600 dark:text-violet-400',
  str: 'text-amber-700 dark:text-amber-300',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-yellow-700 dark:text-yellow-400',
  err: 'text-red-600 dark:text-red-400',
  bold: 'font-semibold',
  cmd: 'text-cyan-700 dark:text-cyan-400',
  add: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  del: 'bg-red-500/10 text-red-700 dark:text-red-300',
  errBadge: 'rounded bg-red-500/15 px-1.5 text-xs font-semibold uppercase text-red-700 dark:text-red-300',
  warnBadge: 'rounded bg-yellow-500/15 px-1.5 text-xs font-semibold uppercase text-yellow-800 dark:text-yellow-300',
}

function bar(percent: number, tone: string): Seg[] {
  const total = 14
  const filled = Math.round(total * percent / 100)
  return [
    [
      '█'.repeat(filled),
      tone,
    ],
    [
      '░'.repeat(total - filled),
      c.faint,
    ],
  ]
}

function localeRow(code: string, percent: number, done: number): Line {
  const tone = percent === 100
    ? c.ok
    : percent >= 95
      ? c.warn
      : c.err
  return [
    '  ',
    [
      code.padEnd(12),
      code === 'en'
        ? c.bold
        : '',
    ],

    ...bar(percent, tone),
    ' ',
    [
      `${percent}%`.padStart(4),
      tone,
    ],
    [`  ${done}/137`, c.dim],
  ]
}

/** A check diagnostic: location, badge with message and rule, and a code frame marked under its middle line. */
function diagnostic(
  path: string,
  pos: string,
  level: 'error' | 'warning',
  text: string,
  rule: string,
  from: number,
  code: [string, string, string],
  mark: [offset: number, length: number],
): Line[] {
  const error = level === 'error'
  const badge = ` ${level.toUpperCase()} `
  // Pad past the badge so the rule lines up for both levels.
  const message = text.padEnd(46 - badge.length)
  return [
    [
      [path, c.path],
      [`:${pos}`, c.dim],
    ],
    [
      [
        badge,
        error ? c.errBadge : c.warnBadge,
      ],
      ` ${message}`,
      [rule, c.dim],
    ],
    ...code.flatMap((line, i): Line[] => [
      [
        [`${String(from + i).padStart(2)} │ `, c.faint],
        [
          line,
          i === 1
            ? ''
            : c.dim,
        ],
      ],
      ...(i === 1
        ? [
            [
              [`   │ `, c.faint],
              [
                ' '.repeat(mark[0]) + '~'.repeat(mark[1]),
                error ? c.err : c.warn,
              ],
            ] as Line,
          ]
        : []),
    ]),
  ]
}

const outputs: Record<typeof props.name, { command: string, busy?: string, lines: Line[] }> = {
  status: {
    command: 'pnpx @x18n/cli',
    busy: 'Reading 4 resources',
    lines: [
      [
        ['x18n ', c.bold],
        ['(my-app)', c.dim],
      ],
      [
        '  ',
        ['4', c.key],
        ' resources, ',
        ['137', c.key],
        ' keys, ',
        ['162', c.key],
        ' usages',
      ],
      [
        ['  ', ''],
        [
          'en (source)'.padEnd(12),
          c.bold,
        ],
        ...bar(100, c.ok),
        ' ',
        ['100%', c.ok],
        ['  137/137', c.dim],
      ],
      localeRow('de', 96, 132),
      localeRow('fr', 91, 125),
      localeRow('ja', 100, 137),
      [
        ['  ', ''],
        ['✖ 1 error', c.err],
        '  ',
        ['⚠ 2 warnings', c.warn],
      ],
      [''],
      [
        ['Commands: ', c.dim],
        ['check', c.cmd],
        ', ',
        ['keys', c.cmd],
        ', ',
        ['get', c.cmd],
        ', ',
        ['usages', c.cmd],
        ', ',
        ['set', c.cmd],
        ', ',
        ['rename', c.cmd],
        ', ',
        ['fill', c.cmd],
        ', ',
        ['ui', c.cmd],
      ],
    ],
  },
  check: {
    command: 'pnpx @x18n/cli check',
    busy: 'Checking 5 locales, 6 resources, 137 keys',
    lines: [
      ...diagnostic('src/App.vue', '17:15', 'error', '"app.titel" is not defined in en.', 'missing-key', 16, [
        '  <main>',
        `    <p>{{ $t('app.titel') }}</p>`,
        '  </main>',
      ], [14, 9]),
      [''],
      ...diagnostic('src/locales/en.json', '18:4', 'warning', '"unused" is not used.', 'unused-key', 17, [
        '  "app.save": "Save",',
        '  "unused": "Nobody uses me",',
        '  "app.title": "Welcome back"',
      ], [3, 6]),
      [''],
      [
        ['✖ 1 error', `${c.err} ${c.bold}`],
        '  ',
        ['⚠ 1 warning', `${c.warn} ${c.bold}`],
        ['  2 files · 96ms', c.dim],
      ],
    ],
  },
  get: {
    command: 'pnpx @x18n/cli get app.loading',
    lines: [
      [
        ['app.loading', c.key],
      ],
      [
        '  ',
        [
          'en'.padEnd(5),
          c.bold,
        ],
        ['"Loading the project…"', c.str],
        ['  src/locales/en.json:4:6', c.dim],
      ],
      [
        '  ',
        [
          'de'.padEnd(5),
          c.bold,
        ],
        ['"Projekt wird geladen…"', c.str],
        ['  src/locales/de.json:5:6', c.dim],
      ],
      [
        '  ',
        [
          'fr'.padEnd(5),
          c.bold,
        ],
        ['"Chargement du projet…"', c.str],
        ['  src/locales/fr.json:5:6', c.dim],
      ],
      [
        '  ',
        [
          'ja'.padEnd(5),
          c.bold,
        ],
        ['"プロジェクトを読み込み中…"', c.str],
        ['  src/locales/ja.json:5:6', c.dim],
      ],
      [
        ['  ', ''],
        ['1', c.ok],
        ' usage',
      ],
      [
        '    ',
        ['src/app.vue:110:15', c.path],
      ],
    ],
  },
  search: {
    command: 'pnpx @x18n/cli search "projekt geladen"',
    lines: [
      [
        ['app.loading', c.key],
        '  ',
        ['de', c.bold],
        '  ',
        ['"Projekt wird geladen…"', c.str],
      ],
      [
        '  ',
        ['src/app.vue:110:15', c.path],
      ],
    ],
  },
  rename: {
    command: 'pnpx @x18n/cli rename app.loading app.busy --dry-run',
    lines: [
      [
        ['edit ', c.bold],
        ['src/locales/de.json', c.path],
      ],
      [
        ['-     "loading": "Projekt wird geladen…",', c.del],
      ],
      [
        ['+     "busy": "Projekt wird geladen…",', c.add],
      ],
      [
        ['edit ', c.bold],
        ['src/locales/en.json', c.path],
      ],
      [
        ['-     "loading": "Loading the project…",', c.del],
      ],
      [
        ['+     "busy": "Loading the project…",', c.add],
      ],
      [
        ['edit ', c.bold],
        ['src/app.vue', c.path],
      ],
      [
        ['- const label = t(\'app.loading\')', c.del],
      ],
      [
        ['+ const label = t(\'app.busy\')', c.add],
      ],
      [
        ['Dry run: nothing was written.', c.dim],
      ],
    ],
  },
  ui: {
    command: 'pnpx @x18n/cli ui',
    lines: [
      [
        ['x18n UI at ', c.bold],
        ['http://localhost:9999/', c.path],
      ],
      [
        ['  auth code  ', c.dim],
        ['123456', c.warn],
      ],
      [
        ['  or open    ', c.dim],
        ['http://localhost:9999/#devframe_otp=123456', c.path],
      ],
      [
        ['  MCP        ', c.dim],
        ['http://localhost:9999/__mcp', c.path],
      ],
      [
        ['  MCP token  ', c.dim],
        'Authorization: Bearer <token>',
      ],
      [''],
      [
        ['● ', c.ok],
        'Ready. Watching 4 resources.',
      ],
    ],
  },
  init: {
    command: 'pnpx @x18n/cli init',
    lines: [
      [
        ['✔ ', c.ok],
        'Wrote ',
        ['x18n.config.ts', c.path],
      ],
      [
        ['  Detected presets: ', c.dim],
        ['vue-i18n', c.key],
      ],
      [
        ['  Locales: ', c.dim],
        ['en', c.bold],
        ', de, fr, ja',
      ],
      [''],
      [
        ['Next: ', c.dim],
        ['pnpx @x18n/cli check', c.cmd],
      ],
    ],
  },
}

const out = computed(() => outputs[props.name])

const root = useTemplateRef<HTMLElement>('root')
const typed = ref(out.value.command)
const running = ref(false)
const shown = ref(out.value.lines.length)
const typing = ref(false)

let run = 0
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function play() {
  const id = ++run
  const { command, busy, lines } = out.value
  typed.value = ''
  shown.value = 0
  running.value = false
  typing.value = true
  await wait(350)
  for (const char of command) {
    if (id !== run)
      return
    typed.value += char
    await wait(32)
  }
  typing.value = false
  await wait(300)
  if (busy) {
    running.value = true
    await wait(800)
    running.value = false
  }
  for (let i = 1; i <= lines.length; i++) {
    if (id !== run)
      return
    shown.value = i
    await wait(110)
  }
}

function rest() {
  run++
  typed.value = out.value.command
  shown.value = out.value.lines.length
  running.value = false
  typing.value = false
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  // Hidden tab panels have no box, so this fires again each time the tab opens.
  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting)
      play()
    else
      rest()
  }, { threshold: 0.2 })
  observer.observe(root.value!)
  onBeforeUnmount(() => {
    run++
    observer.disconnect()
  })
})

function seg(s: Seg): [string, string] {
  return typeof s === 'string'
    ? [s, '']
    : s
}
</script>

<template>
  <div
    ref="root"
    class="not-prose relative isolate overflow-hidden rounded-2xl bg-white font-mono text-[13px] leading-6 text-neutral-800 shadow-sm dark:bg-neutral-950 dark:text-neutral-200"
  >
    <!-- The border is an overlay so the clipped children cannot paint over its curved corners. -->
    <div class="pointer-events-none absolute inset-0 z-10 rounded-2xl border border-muted" aria-hidden="true" />
    <div class="flex items-center gap-1.5 border-b border-muted px-4 py-2.5">
      <span class="size-2.5 rounded-full bg-red-400/80" />
      <span class="size-2.5 rounded-full bg-yellow-400/80" />
      <span class="size-2.5 rounded-full bg-emerald-400/80" />
      <span class="ml-3 text-xs text-neutral-500">my-app</span>
    </div>
    <div class="h-[27rem] overflow-hidden p-5">
      <div class="flex items-center gap-2.5">
        <span class="text-emerald-600 dark:text-emerald-400">❯</span>
        <span>{{ typed }}<span v-if="typing" class="term-caret">▍</span></span>
      </div>

      <div v-if="running" class="mt-3 flex items-center gap-2 text-neutral-500">
        <UIcon name="i-ph-spinner-duotone" class="size-4 animate-spin" />
        {{ out.busy }}
      </div>

      <div class="mt-3 whitespace-pre">
        <template v-for="(line, i) in out.lines" :key="i">
          <div v-if="shown > i" class="term-in min-h-6">
            <span v-for="(s, j) in line" :key="j" :class="seg(s)[1]">{{ seg(s)[0] }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.term-caret {
  animation: term-blink 1s steps(1) infinite;
}
.term-in {
  animation: term-fade-in 0.25s ease-out;
}
@keyframes term-blink {
  50% { opacity: 0; }
}
@keyframes term-fade-in {
  from { opacity: 0; transform: translateY(3px); }
}
</style>

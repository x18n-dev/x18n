import type { CallSpec, ScanResult } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { i18next } from '../src/presets/i18next'
import { reactI18next } from '../src/presets/react-i18next'
import { reactIntl } from '../src/presets/react-intl'
import { vueI18n } from '../src/presets/vue-i18n'
import { loadParser, scanSource } from '../src/scanners/shared/js'
import { createTestProject, json } from './_utils'

const calls: CallSpec[] = [
  {
    callee: ['t', '$t', 'i18n.t'],
    namespace: { arg: 1, property: 'ns' },
  },
  {
    callee: 'useTranslation',
    factory: true,
    returns: ['t'],
    namespace: { arg: 0 },
    keyPrefix: { arg: 1, property: 'keyPrefix' },
  },
  {
    callee: 'Trans',
    key: { arg: 0, property: 'i18nKey' },
  },
  {
    callee: 'tr',
    types: ['TFunction'],
  },
  {
    callee: 'defineMessages',
    key: { arg: 0, property: '*.id' },
  },
  { callee: 'useSharedTranslation', factory: true, namespace: 'shared' },
]

async function scan(code: string, filename = 'a.tsx'): Promise<ScanResult> {
  return scanSource(await loadParser(), code, { calls, filename })
}

function keys(result: ScanResult, code: string): string[] {
  return result.usages.map(u => `${u.raw}|${code.slice(u.range.start, u.range.end)}|${u.kind}|${u.dynamic}|${u.namespace ?? ''}|${u.keyPrefix ?? ''}`)
}

describe('js scanner', () => {
  it('finds declared calls, members and option namespaces', async () => {
    const code = `t('a.b'); i18n.t("c"); this.$t('d'); t('e', { ns: 'auth' }); other('x')`
    expect(keys(await scan(code), code)).toEqual([
      'a.b|a.b|call|false||',
      'c|c|call|false||',
      'd|d|call|false||',
      'e|e|call|false|auth|',
    ])
  })

  it('follows factories, aliases and renamed imports per function', async () => {
    const code = [
      `import { t as tr2 } from 'i18next'`,
      `function A() { const { t } = useTranslation('auth', { keyPrefix: 'login' }); return t('title') }`,
      `function B() { const { t: tt } = useTranslation(['common']); const t3 = tt; return t3('save') }`,
      `tr2('plain')`,
      `function C(tr: TFunction) { tr('typed') }`,
    ].join('\n')
    expect(keys(await scan(code), code)).toEqual([
      'title|title|call|false|auth|login',
      'save|save|call|false|common|',
      'plain|plain|call|false||',
      'typed|typed|call|false||',
    ])
  })

  it('reads the namespace of a typed translate function from its type argument', async () => {
    const code = [
      `interface Props { t: TFunction<'props'> }`,
      `export type Other = { t: TFunction }`,
      `function A(t: TFunction<'shared', undefined>) { t('a') }`,
      `function B(t: TFunction<['first', 'second']>) { t('b') }`,
      `function C({ t: tr }: { t: TFunction<'inline'> }) { tr('c') }`,
      `function D({ t }: Props) { t('d') }`,
      `function E({ t }: Other) { t('e') }`,
    ].join('\n')
    expect(keys(await scan(code), code)).toEqual([
      'a|a|call|false|shared|',
      'b|b|call|false|first|',
      'c|c|call|false|inline|',
      'd|d|call|false|props|',
      'e|e|call|false||',
    ])
  })

  it('gives a hook with a fixed namespace that namespace', async () => {
    const code = `const { t } = useSharedTranslation(); t('a')`
    expect(keys(await scan(code), code)).toEqual(['a|a|call|false|shared|'])
  })

  it('reads constants, markers, selectors, templates and JSX', async () => {
    const code = [
      `const KEY = 'const.key'`,
      `const KEYS = { title: 'obj.title' } as const`,
      `t(KEY); t(KEYS.title); t($ => $.sel.ector)`,
      `t(\`pages.\${id}.title\`); t(\`static\`); t(variable)`,
      `const m = /* @x18n-key */ 'marked'`,
      `// @x18n-keys`,
      `const list = ['l1', 'l2']`,
      `const el = <Trans i18nKey="jsx.key" />`,
      `defineMessages({ a: { id: 'msg.a' }, b: { id: 'msg.b' } })`,
    ].join('\n')
    expect(keys(await scan(code), code)).toEqual([
      'const.key|const.key|constant|false||',
      'obj.title|obj.title|constant|false||',
      'sel.ector|sel.ector|selector|false||',
      'pages.|pages.|call|prefix||',
      'static|static|call|false||',
      'variable|variable|call|unknown||',
      'jsx.key|jsx.key|call|false||',
      'msg.a|msg.a|call|false||',
      'msg.b|msg.b|call|false||',
      'marked|marked|marker|false||',
      'l1|l1|marker|false||',
      'l2|l2|marker|false||',
    ])
  })

  it('records the call of a key literal, not of keys picked from a condition or a constant', async () => {
    const code = `const K = 'k'; t('a', { n: 1 }); t(\`b\`); t(ok ? 'c' : 'd'); t(K); <Trans i18nKey="e" />`
    const result = await scan(code)
    expect(result.usages.map(u => `${u.raw}|${u.expression
      ? code.slice(u.expression.start, u.expression.end)
      : ''}`)).toEqual([
      'a|t(\'a\', { n: 1 })',
      'b|t(`b`)',
      'c|',
      'd|',
      'k|',
      'e|',
    ])
  })

  it('expands finite dynamic keys', async () => {
    const code = [
      `const MODE = 'm'`,
      `t(\`state.\${isDone ? 'done' : 'notDone'}.title\`)`,
      `t(\`\${ok ? 'x' : 'y'}.\${MODE ?? 'z'}\`, { ns: 'auth' })`,
      `const KEYS = ['a', 'b'] as const`,
      `KEYS.map(k => t(\`item.\${k}\`))`,
      `KEYS.forEach(function (k) { t(k) })`,
      `const MAP = { ok: 'result.ok', err: 'result.err' } as const`,
      `t(MAP[cond ? 'ok' : 'err']); t(MAP['ok']); t(KEYS[1])`,
    ].join('\n')
    const result = await scan(code)
    expect(keys(result, code)).toEqual([
      `state.done.title|state.\${isDone ? 'done' : 'notDone'}.title|expanded|false||`,
      `state.notDone.title|state.\${isDone ? 'done' : 'notDone'}.title|expanded|false||`,
      `x.m|\${ok ? 'x' : 'y'}.\${MODE ?? 'z'}|expanded|false|auth|`,
      `x.z|\${ok ? 'x' : 'y'}.\${MODE ?? 'z'}|expanded|false|auth|`,
      `y.m|\${ok ? 'x' : 'y'}.\${MODE ?? 'z'}|expanded|false|auth|`,
      `y.z|\${ok ? 'x' : 'y'}.\${MODE ?? 'z'}|expanded|false|auth|`,
      `item.a|item.\${k}|expanded|false||`,
      `item.b|item.\${k}|expanded|false||`,
      // Picked from constants, the keys are literals that rename can rewrite.
      'a|a|constant|false||',
      'b|b|constant|false||',
      'result.ok|result.ok|constant|false||',
      'result.err|result.err|constant|false||',
      'result.ok|result.ok|constant|false||',
      'b|b|constant|false||',
    ])
    expect(result.usages[0]!.expression).toEqual({
      start: code.indexOf('t(`state'),
      end: code.indexOf('\n', code.indexOf('t(`state')),
    })
    // The literals inside the template are key parts, not hard strings.
    expect(result.hardStrings!.map(h => h.text)).not.toContain('notDone')
  })

  it('keeps a prefix usage when a dynamic key is not a few string literals', async () => {
    const twoTo = (n: number): string => Array.from({ length: n }).fill(`\${a ? 'a' : 'b'}`).join('')
    const code = [
      `const KEYS = ['a', 'b']`,
      `t(\`a.\${unknown}\`); t(\`b.\${ok ? 'x' : other}\`); items.map(k => t(\`c.\${k}\`))`,
      // An inner parameter shadows the outer one.
      `KEYS.map(k => [x].map(k => t(\`d.\${k}\`)))`,
      `;[].map(k => t(\`g.\${k}\`))`,
      // 2^6 keys is over the cap, 2^5 is not.
      `t(\`e.${twoTo(6)}\`); t(\`f.${twoTo(5)}\`)`,
    ].join('\n')
    const result = keys(await scan(code), code)
    expect(result.slice(0, 6)).toEqual([
      'a.|a.|call|prefix||',
      'b.|b.|call|prefix||',
      'c.|c.|call|prefix||',
      'd.|d.|call|prefix||',
      'g.|g.|call|prefix||',
      'e.|e.|call|prefix||',
    ])
    expect(result.slice(6)).toHaveLength(32)
  })

  it('collects hard strings outside translate calls', async () => {
    const code = `import x from 'mod'; console.log('debug'); const a = <p title="Hover me">Hello world</p>; const b = 'Some text'; t('key')`
    const hard = (await scan(code)).hardStrings!.map(h => `${h.kind}:${h.text}`)
    expect(hard).toEqual(['jsx-attribute:Hover me', 'jsx-text:Hello world', 'js-string:Some text'])
  })
})

describe('project usages', () => {
  it('scans Vue SFCs and resolves missing and unused keys', async () => {
    const { project } = await createTestProject({
      'package.json': json({
        dependencies: { 'vue-i18n': '11' },
      }),
      'src/locales/en.json': json({
        a: 'A',
        b: 'B',
        unused: 'x',
        pages: { home: 'H' },
        block: 'x',
      }),
      'src/App.vue': [
        '<script setup lang="ts">',
        'const { t } = useI18n()',
        't(\'a\')',
        '</script>',
        '<template>',
        '  <p>{{ $t(\'b\') }}</p>',
        '  <p v-t="\'block\'" />',
        '  <i18n-t keypath="missing.key" />',
        '  <CommonLocalizedNumber keypath="b" :count="1" />',
        '  <i18n-t :keypath="ok ? \'a\' : \'block\'" />',
        '  <p>{{ $t(`pages.${x}`) }}</p>', // eslint-disable-line no-template-curly-in-string
        '</template>',
        '<i18n lang="json">{ "en": { "local": "L" } }</i18n>',
      ].join('\n'),
    }, {
      presets: [
        vueI18n(),
      ],
    })
    const analysis = project.analyze()
    expect(project.usages().map(m => m.usage.key)).toEqual([
      'a',
      'b',
      'block',
      'missing.key',
      'b',
      'a',
      'block',
      'pages.',
    ])
    const text = project.text('src/App.vue')!
    expect(project.usages().map(({ usage: { expression } }) => expression && text.slice(expression.start, expression.end))).toEqual([
      't(\'a\')',
      '$t(\'b\')',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '$t(`pages.${x}`)', // eslint-disable-line no-template-curly-in-string
    ])
    expect(analysis.unused).toEqual(['local', 'unused'])
    expect(analysis.undefinedUsages.map(u => u.key)).toEqual(['missing.key'])
    const missing = analysis.diagnostics.find(d => d.code === 'missing-key')!
    expect(project.text('src/App.vue')!.slice(missing.location!.range.start, missing.location!.range.end)).toBe('missing.key')
    expect(project.keyAt('src/App.vue', project.text('src/App.vue')!.indexOf('b\')'))).toMatchObject({ type: 'key', key: 'b', source: 'usage' })
    expect(project.message('local', 'en')?.value).toBe('L')
  })

  it('scans Astro frontmatter, template expressions and scripts', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({
        page: { title: 'T' },
        hero: { title: 'H', alt: 'A' },
        items: { one: '1' },
        a: 'A',
        unused: 'x',
      }),
      'src/pages/index.astro': [
        '---',
        'import { t } from \'i18next\'',
        'const title = t(\'page.title\')',
        '---',
        '<!-- {t(\'commented.out\')} -->',
        '<html>',
        '<head><title>{title}</title><style>p { color: red }</style></head>',
        '<body>',
        '  <h1 data-x="{not.an.expression}">{t(\'hero.title\')}</h1>',
        '  <img alt={t(\'hero.alt\')} src="/a.png">',
        '  <ul>{items.map(item => <li title="Don\'t">{t(`items.${item}`)}</li>)}</ul>', // eslint-disable-line no-template-curly-in-string
        '  {/* t(\'in.comment\') */}',
        '  <p>{cond ? t(\'a\') : t(\'missing\')}</p>',
        '</body>',
        '</html>',
        '<script>',
        '  import i18next from \'i18next\'',
        '  document.title = i18next.t(\'client.title\')',
        '</script>',
      ].join('\n'),
    }, {
      presets: [
        i18next(),
      ],
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    })
    expect(project.usages().map(m => m.usage.key)).toEqual([
      'page.title',
      'hero.title',
      'hero.alt',
      'items.',
      'a',
      'missing',
      'client.title',
    ])
    const analysis = project.analyze()
    expect(analysis.unused).toEqual(['unused'])
    expect(analysis.undefinedUsages.map(u => u.key)).toEqual(['missing', 'client.title'])
  })

  it.each([
    [
      'an escaped backslash before the closing quote',
      '<p>{t(\'a\\\\\')}{t(\'b\')}</p>',
      ['a\\', 'b'],
    ],
    [
      'an escaped quote',
      '<p>{t(\'a\\\'b\')}{t(\'c\')}</p>',
      ['a\'b', 'c'],
    ],
    [
      'a regex literal holding a quote',
      '<p>{x.replace(/[/\']/g, \'\')}{t(\'c\')}</p>',
      ['c'],
    ],
    [
      'a division after a value',
      '<p>{t(\'a\', { n: x / 2 })}{t(\'c\')}</p>',
      ['a', 'c'],
    ],
    ['an unterminated string ending in a backslash', '<p>{\'ab\\c', []],
  ])('finds Astro expression keys past %s', { timeout: 2000 }, async (_, template, expected) => {
    const { project } = await createTestProject({
      'locales/en.json': json({}),
      'src/index.astro': template,
    }, {
      presets: [
        i18next(),
      ],
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(expected)
  })

  it('applies namespaces, key prefixes and derived keys with i18next', async () => {
    const { project } = await createTestProject({
      'locales/en/common.json': json({ save: 'Save', item_one: '1', item_other: 'n' }),
      'locales/en/auth.json': json({
        login: { title: 'T' },
      }),
      'src/App.tsx': [
        `const { t } = useTranslation('auth', { keyPrefix: 'login' })`,
        `t('title'); t('common:save'); t('common:item', { count: 1 })`,
      ].join('\n'),
    }, {
      presets: [
        reactI18next(),
      ],
      resources: [
        { pattern: 'locales/{locale}/{namespace}.json' },
      ],
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['auth:login.title', 'common:save', 'common:item'])
    const analysis = project.analyze()
    expect(analysis.unused).toEqual([])
    expect(analysis.undefinedUsages).toEqual([])
  })

  it('honours keysInUse and inline suppression', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({
        runtime: { a: 'x' },
        used: 'y',
      }),
      'src/a.ts': `// x18n-disable-next-line\nt('nope')\nintl.formatMessage({ id: 'used' })`,
    }, {
      presets: [
        reactIntl(),
      ],
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
      usage: {
        keysInUse: ['runtime.*'],
      },
    })
    expect(project.analyze().unused).toEqual([])
    expect(project.analyze().undefinedUsages).toEqual([])
  })

  it('counts each key of a finite dynamic key as used, and only those', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({
        state: {
          done: { title: 'Done' },
          other: { title: 'Other' },
        },
        item: { a: 'A', b: 'B' },
        result: { ok: 'OK', err: 'Error' },
      }),
      'src/a.ts': [
        `t(\`state.\${isDone ? 'done' : 'notDone'}.title\`)`,
        `const KEYS = ['a', 'b'] as const`,
        `KEYS.map(k => t(\`item.\${k}\`))`,
        `const MAP = { ok: 'result.ok', err: 'result.err' } as const`,
        `t(MAP[cond ? 'ok' : 'err'])`,
      ].join('\n'),
    }, {
      presets: [
        i18next(),
      ],
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    })
    const analysis = project.analyze()
    expect(analysis.unused).toEqual(['state.other.title'])
    expect(analysis.undefinedUsages.map(u => u.key)).toEqual(['state.notDone.title'])
  })
})

import type { CallSpec, ScanResult } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { reactI18next, reactIntl, vueI18n } from '../src/presets'
import { loadParser, scanSource } from '../src/scanners/js'
import { createTestProject, json } from './_utils'

const calls: CallSpec[] = [
  { callee: ['t', '$t', 'i18n.t'], namespace: { arg: 1, property: 'ns' } },
  { callee: 'useTranslation', factory: true, returns: ['t'], namespace: { arg: 0 }, keyPrefix: { arg: 1, property: 'keyPrefix' } },
  { callee: 'Trans', key: { arg: 0, property: 'i18nKey' } },
  { callee: 'tr', types: ['TFunction'] },
  { callee: 'defineMessages', key: { arg: 0, property: '*.id' } },
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

  it('collects hard strings outside translate calls', async () => {
    const code = `import x from 'mod'; console.log('debug'); const a = <p title="Hover me">Hello world</p>; const b = 'Some text'; t('key')`
    const hard = (await scan(code)).hardStrings!.map(h => `${h.kind}:${h.text}`)
    expect(hard).toEqual(['jsx-attribute:Hover me', 'jsx-text:Hello world', 'js-string:Some text'])
  })
})

describe('project usages', () => {
  it('scans Vue SFCs and resolves missing and unused keys', async () => {
    const { project } = await createTestProject({
      'package.json': json({ dependencies: { 'vue-i18n': '11' } }),
      'src/locales/en.json': json({ a: 'A', b: 'B', unused: 'x', pages: { home: 'H' }, block: 'x' }),
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
    }, { presets: [vueI18n()] })
    const analysis = project.analyze()
    expect(project.usages().map(m => m.usage.key)).toEqual(['a', 'b', 'block', 'missing.key', 'b', 'a', 'block', 'pages.'])
    expect(analysis.unused).toEqual(['local', 'unused'])
    expect(analysis.undefinedUsages.map(u => u.key)).toEqual(['missing.key'])
    const missing = analysis.diagnostics.find(d => d.code === 'missing-key')!
    expect(project.text('src/App.vue')!.slice(missing.location!.range.start, missing.location!.range.end)).toBe('missing.key')
    expect(project.keyAt('src/App.vue', project.text('src/App.vue')!.indexOf('b\')'))).toMatchObject({ type: 'key', key: 'b', source: 'usage' })
    expect(project.message('local', 'en')?.value).toBe('L')
  })

  it('applies namespaces, key prefixes and derived keys with i18next', async () => {
    const { project } = await createTestProject({
      'locales/en/common.json': json({ save: 'Save', item_one: '1', item_other: 'n' }),
      'locales/en/auth.json': json({ login: { title: 'T' } }),
      'src/App.tsx': [
        `const { t } = useTranslation('auth', { keyPrefix: 'login' })`,
        `t('title'); t('common:save'); t('common:item', { count: 1 })`,
      ].join('\n'),
    }, { presets: [reactI18next()], resources: [{ pattern: 'locales/{locale}/{namespace}.json' }] })
    expect(project.usages().map(m => m.usage.key)).toEqual(['auth:login.title', 'common:save', 'common:item'])
    const analysis = project.analyze()
    expect(analysis.unused).toEqual([])
    expect(analysis.undefinedUsages).toEqual([])
  })

  it('honours keysInUse and inline suppression', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({ runtime: { a: 'x' }, used: 'y' }),
      'src/a.ts': `// x18n-disable-next-line\nt('nope')\nintl.formatMessage({ id: 'used' })`,
    }, { presets: [reactIntl()], resources: [{ pattern: 'locales/{locale}.json' }], usage: { keysInUse: ['runtime.*'] } })
    expect(project.analyze().unused).toEqual([])
    expect(project.analyze().undefinedUsages).toEqual([])
  })
})

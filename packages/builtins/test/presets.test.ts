import { describe, expect, it } from 'vitest'
import { createTestProject, json } from './_utils'

const pkg = (...deps: string[]): string => json({ dependencies: Object.fromEntries(deps.map(dep => [dep, '*'])) })

describe('tier 1 presets', () => {
  it('next-intl: useTranslations namespaces and t.rich', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('next-intl'),
      'messages/en.json': json({ Home: { title: 'Hi {name}', rich: '<b>x</b>' }, About: { text: 'a' } }),
      'app/page.tsx': [
        `import { useTranslations } from 'next-intl'`,
        `export default function Page() { const t = useTranslations('Home'); return <h1>{t('title', { name: 'x' })}{t.rich('rich', {})}</h1> }`,
        `export async function generateMetadata() { const t = await getTranslations({ namespace: 'About' }); return t('text') }`,
      ].join('\n'),
    })
    expect(project.explain().presets.find(p => p.name === 'next-intl')?.reason).toBe('detected')
    expect(project.usages().map(m => m.usage.key)).toEqual(['Home.title', 'Home.rich', 'About.text'])
    expect(project.analyze().unused).toEqual([])
  })

  it('react-intl: formatMessage, FormattedMessage and defineMessages', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('react-intl'),
      'lang/en.json': json({ 'app.title': 'T', 'app.hello': 'Hello {name}', 'app.count': '{n, plural, one {# item} other {# items}}' }),
      'lang/de.json': json({ 'app.title': 'T', 'app.hello': 'Hallo {who}', 'app.count': '{n, plural, one {# Ding}}' }),
      'src/App.tsx': [
        `const m = defineMessages({ title: { id: 'app.title' } })`,
        `intl.formatMessage({ id: 'app.hello' }, { name })`,
        `const el = <FormattedMessage id="app.count" />`,
      ].join('\n'),
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['app.title', 'app.hello', 'app.count'])
    const codes = project.analyze().diagnostics.map(d => `${d.code}:${d.key}`)
    expect(codes).toContain('placeholder-mismatch:app.hello')
    expect(codes).toContain('invalid-syntax:app.count')
  })

  it('svelte-i18n: $_ in markup and script', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('svelte-i18n', 'svelte'),
      'src/locales/en.json': json({ page: { title: 'T', body: 'B' } }),
      'src/App.svelte': `<script>\n  import { _ } from 'svelte-i18n'\n  const x = $_('page.body')\n</script>\n<h1 title={$_('page.title')}>Hello</h1>`,
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['page.body', 'page.title'])
  })

  it('solid-primitives-i18n: t calls with double-brace placeholders', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@solid-primitives/i18n', 'solid-js'),
      'src/locales/en.json': json({ home: { title: 'Hi {{name}}' } }),
      'src/App.tsx': `export default () => <h1>{t('home.title', { name: 'x' })}</h1>`,
    })
    expect(project.explain().presets.find(p => p.name === 'solid-primitives-i18n')?.reason).toBe('detected')
    expect(project.usages().map(m => m.usage.key)).toEqual(['home.title'])
  })

  it('paraglide: m.key() and m[\'key\']() usages', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@inlang/paraglide-js'),
      'messages/en.json': json({ 'hello_world': 'Hello {name}', 'a.b': 'AB' }),
      'src/App.svelte': `<h1>{m.hello_world({ name })}</h1>\n<p>{m['a.b']()}</p>`,
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['hello_world', 'a.b'])
  })

  it('vscode-extension: package.nls files and %key% references', async () => {
    const { project } = await createTestProject({
      'package.json': json({ devDependencies: { '@types/vscode': '*' }, contributes: { commands: [{ title: '%cmd.open%' }] } }),
      'package.nls.json': json({ 'cmd.open': 'Open' }),
      'package.nls.de.json': json({ 'cmd.open': 'Öffnen' }),
      'src/extension.ts': `vscode.l10n.t('Hello')`,
    })
    expect(project.locales).toEqual(['en', 'de'])
    expect(project.usages().map(m => m.usage.key)).toContain('cmd.open')
  })

  it('nuxt-i18n: langDir defaults', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@nuxtjs/i18n'),
      'nuxt.config.ts': `export default defineNuxtConfig({ i18n: { langDir: 'locales' } })`,
      'i18n/locales/en.json': json({ hi: 'Hi' }),
      'pages/index.vue': `<template><p>{{ $t('hi') }}</p></template>`,
    })
    expect(project.keys()).toEqual(['hi'])
    expect(project.analyze().unused).toEqual([])
  })

  it('i18next: plural suffixes count as the base key', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('i18next'),
      'locales/en/translation.json': json({ apple_one: 'apple', apple_other: 'apples', greet: 'Hi {{name}}' }),
      'src/a.ts': `i18next.t('apple', { count: 2 }); i18next.t('greet', { name })`,
    })
    expect(project.keys()).toEqual(['translation:apple_one', 'translation:apple_other', 'translation:greet'])
    const analysis = project.analyze()
    expect(analysis.unused).toEqual([])
    expect(analysis.undefinedUsages).toEqual([])
  })

  it('i18next: context, ordinal and plural suffixes stack on the base key', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('i18next'),
      'locales/en/translation.json': json({
        friend_other: 'friends',
        friend_male_one: 'a boyfriend',
        friend_male_other: 'boyfriends',
        place_ordinal_one: '{{count}}st',
        place_ordinal_other: '{{count}}th',
      }),
      'src/a.ts': `i18next.t('friend', { context: 'male', count: 2 }); i18next.t('place', { count: 1, ordinal: true })`,
    })
    const analysis = project.analyze()
    expect(analysis.unused).toEqual([])
    expect(analysis.undefinedUsages).toEqual([])
    expect(project.lookup('translation:friend', 'en')?.value).toBe('friends')
    expect(project.lookup('translation:place', 'en')?.value).toBe('{{count}}th')
  })

  it('i18next: each locale needs the plural categories of its own language', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('i18next'),
      'locales/en/translation.json': json({ apple_zero: 'no apples', apple_one: 'an apple', apple_other: 'apples', place_ordinal_one: '1st', place_ordinal_other: 'nth' }),
      'locales/ja/translation.json': json({ apple_other: 'りんご', place_ordinal_other: '番目' }),
      'locales/ru/translation.json': json({ apple_one: 'яблоко', apple_other: 'яблока', place_ordinal_other: '-й' }),
      'src/a.ts': `i18next.t('apple', { count }); i18next.t('place', { count, ordinal: true })`,
    })
    const missing = Object.fromEntries(project.analyze().coverage.map(c => [c.locale, c.missing]))
    // English has no `zero` category: `apple_zero` is optional. English ordinals have `two` and `few`.
    expect(missing).toEqual({
      en: ['translation:place_ordinal_few', 'translation:place_ordinal_two'],
      ja: [],
      ru: ['translation:apple_few', 'translation:apple_many'],
    })
    expect(project.get('translation:apple_one')?.missing).toEqual([])
    expect(project.lookup('translation:apple', 'ja')?.value).toBe('りんご')

    const diagnostic = project.analyze().diagnostics.find(d => d.code === 'missing-translation' && d.key === 'translation:apple_few')!
    expect(diagnostic.location?.path).toBe('locales/en/translation.json')
    const copy = diagnostic.fixes.find(fix => fix.title === 'Copy the source value')!
    await project.apply(project.plan(copy.ops))
    expect(project.message('translation:apple_few', 'ru')?.value).toBe('apples')
  })

  it('i18next: a locale with one form only shows it', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('i18next'),
      'locales/en/translation.json': json({ apple_one: 'an apple', apple_other: 'apples' }),
      'locales/de/translation.json': json({ apple_one: 'ein Apfel' }),
      'src/a.ts': `i18next.t('apple', { count })`,
    })
    expect(project.lookup('translation:apple', 'de')?.value).toBe('ein Apfel')
  })
})

// Cases that i18n-ally-next fixed after the fork of i18n-ally.
describe('namespaces', () => {
  it('react-i18next: folders, keyPrefix, flat dotted keys, Translation and withTranslation', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('react-i18next', 'i18next'),
      'locales/en/translation.json': json({ 'common.stackTrace': 'Stack', 'title': 'T' }),
      'locales/en/errors.json': json({ notFound: 'Not found' }),
      'locales/en/pages/home.json': json({ title: 'Home', foo: { bar: { baz: 'B' } } }),
      'src/A.tsx': [
        `function A() { const { t } = useTranslation(); return t('common.stackTrace') + t('errors:notFound') }`,
        `function B() { const { t } = useTranslation('pages/home', { keyPrefix: 'foo.bar' }); return t('baz') + t('translation:title') }`,
        `function C() { const { t } = useTranslation('pages/home'); return t('title') + t('pages/home:foo.bar.baz') }`,
        `function E() { const { t } = useTranslation(undefined, { keyPrefix: 'common' }); return t('stackTrace') }`,
        `function F() { return <Translation ns="pages/home" keyPrefix="foo.bar">{t => <p>{t('baz')}</p>}</Translation> }`,
      ].join('\n'),
      'src/D.tsx': `function D({ t }) { return t('notFound') }\nexport default withTranslation('errors')(D)\n`,
      'src/G.tsx': `function G({ t }) { return t('baz') }\nexport default withTranslation('pages/home', { keyPrefix: 'foo.bar' })(G)\n`,
    }, { resources: [{ pattern: 'locales/{locale}/{namespaces}.json' }], keyStyle: 'flat' })
    expect(project.usages().map(m => m.usage.key)).toEqual([
      'translation:common.stackTrace',
      'errors:notFound',
      'pages/home:foo.bar.baz',
      'translation:title',
      'pages/home:title',
      'pages/home:foo.bar.baz',
      'translation:common.stackTrace',
      'pages/home:foo.bar.baz',
      'errors:notFound',
      'pages/home:foo.bar.baz',
    ])
    expect(project.analyze().undefinedUsages).toEqual([])
  })

  it('i18next: a configured default namespace and explicit ones', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('i18next'),
      'locales/en/translation.json': json({ a: 'A' }),
      'locales/en/errors.json': json({ x: 'X' }),
      'src/a.ts': `i18next.t('x'); i18next.t('errors:x'); i18next.t('translation:a')`,
    }, { resources: [{ pattern: 'locales/{locale}/{namespace}.json' }], namespace: { default: 'errors' } })
    expect(project.usages().map(m => m.usage.key)).toEqual(['errors:x', 'errors:x', 'translation:a'])
    expect(project.analyze().undefinedUsages).toEqual([])
  })

  it('i18next: fallbackNS from the init code finds keys missing in the scope namespace', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('react-i18next', 'i18next'),
      'src/i18n.ts': `i18next.init({ defaultNS: 'app', fallbackNS: ['common'] })`,
      'locales/en/app.json': json({ title: 'App', save: 'Save app' }),
      'locales/en/common.json': json({ save: 'Save', delete: 'Delete' }),
      'locales/en/event.json': json({ name: 'Name' }),
      'src/Event.tsx': `const { t } = useTranslation('event'); t('name'); t('delete'); t('nope'); t('app:title')`,
      'src/App.tsx': `const { t } = useTranslation(); t('save'); t('delete')`,
    }, { resources: [{ pattern: 'locales/{locale}/{namespace}.json' }] })
    expect(project.config.namespace).toMatchObject({ default: 'app', fallback: ['common'] })
    expect(project.usages().map(m => m.usage.key)).toEqual(['app:save', 'common:delete', 'event:name', 'common:delete', 'event:nope', 'app:title'])
    expect(project.analyze().undefinedUsages.map(u => u.key)).toEqual(['event:nope'])
  })

  it('namespace.byFile names the namespace of keys per source folder', async () => {
    const { project } = await createTestProject({
      'locales/en/a.json': json({ productName: 'A' }),
      'locales/en/b.json': json({ productName: 'B' }),
      'a/src/index.js': `t('productName'); t('b:productName')`,
      'b/src/index.js': `t('productName')`,
    }, {
      resources: [{ pattern: 'locales/{locale}/{namespace}.json' }],
      namespace: { separator: ':', byFile: { 'a/**': 'a', 'b/**': 'b' } },
      usage: { calls: [{ callee: 't' }] },
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['a:productName', 'b:productName', 'b:productName'])
    expect(project.analyze().unused).toEqual([])
  })

  it('a custom separator and a hook with a fixed namespace', async () => {
    const { project, files } = await createTestProject({
      'locales/en/shared.json': json({ type: { bug: 'Bug' } }),
      'locales/en/common.json': json({ ok: 'OK' }),
      'src/a.ts': `const { t } = useSharedTranslation(); t('type.bug'); t('common|ok')`,
    }, {
      resources: [{ pattern: 'locales/{locale}/{namespace}.json' }],
      namespace: { separator: '|' },
      usage: { calls: [{ callee: 'useSharedTranslation', factory: true, namespace: 'shared' }] },
    })
    expect(project.usages().map(m => m.usage.key)).toEqual(['shared:type.bug', 'common:ok'])
    expect(project.parseKey('common|ok')).toBe('common:ok')
    await project.apply(project.plan([{ type: 'rename', from: 'shared:type.bug', to: 'common:bug' }]))
    expect(files.get('src/a.ts')).toBe(`const { t } = useSharedTranslation(); t('common|bug'); t('common|ok')`)
  })

  it('transloco: a kebab-case scope folder is a camelCase key prefix', async () => {
    const { project, files } = await createTestProject({
      'package.json': pkg('@jsverse/transloco'),
      'src/assets/i18n/en.json': json({ hello: 'Hello' }),
      'src/assets/i18n/todos-page/en.json': json({ title: 'Todos' }),
      'src/assets/i18n/de.json': json({ hello: 'Hallo' }),
      'src/app/todos.component.html': `<h1>{{ 'todosPage.title' | transloco }}</h1><p>{{ 'hello' | transloco }}</p>`,
    })
    expect(project.keys()).toEqual(['hello', 'todosPage.title'])
    expect(project.analyze().undefinedUsages).toEqual([])
    await project.apply(project.plan([{ type: 'set', key: 'todosPage.title', locale: 'de', value: 'Aufgaben' }]))
    expect(JSON.parse(files.get('src/assets/i18n/todos-page/de.json')!)).toEqual({ title: 'Aufgaben' })
  })
})

describe('glossary check', () => {
  it('matches terms as whole words', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({ a: 'Open the workspace', b: 'Workspaces list', c: 'Homepage' }),
      'locales/de.json': json({ a: 'Öffne den Ordner', b: 'Liste', c: 'Startseite' }),
    }, {
      resources: [{ pattern: 'locales/{locale}.json' }],
      glossary: [{ term: 'Workspace', translations: { de: 'Arbeitsbereich' } }, { term: 'Home', translations: { de: 'Start' } }],
      checks: { glossary: 'warning' },
    })
    expect(project.analyze().diagnostics.filter(d => d.code === 'glossary').map(d => d.key)).toEqual(['a'])
  })

  it('matches terms inside text written without spaces', async () => {
    const { project } = await createTestProject({
      'locales/ja.json': json({ a: 'ふりがなをフォントに内蔵。', b: 'ふりがなを表示する' }),
      'locales/en.json': json({ a: 'Furigana built into the font.', b: 'Show furigana' }),
      'locales/zh.json': json({ a: '字体内置注音。', b: '显示拼音' }),
    }, {
      resources: [{ pattern: 'locales/{locale}.json' }],
      sourceLocale: 'ja',
      glossary: [{ term: 'ふりがな', translations: { en: 'Furigana', zh: '注音' } }],
      checks: { glossary: 'warning' },
    })
    expect(project.analyze().diagnostics.filter(d => d.code === 'glossary').map(d => [d.key, d.locale])).toEqual([['b', 'zh']])
  })
})

describe('placeholder-mismatch', () => {
  it('skips linked messages and the implicit plural names of vue-i18n', async () => {
    const { project } = await createTestProject({
      'package.json': json({ dependencies: { 'vue-i18n': '*' } }),
      'locales/en.json': json({ follow: 'Follow back', you: 'Follows you', days: 'in 0 days|tomorrow|in {n} days', hi: 'Hi {name}' }),
      'locales/fr.json': json({ follow: 'Suivre', you: '@:follow', days: 'dans {v} jours', hi: 'Salut' }),
    }, { resources: [{ pattern: 'locales/{locale}.json' }] })
    const problems = project.analyze().diagnostics.filter(d => d.code === 'placeholder-mismatch').map(d => d.message)
    expect(problems).toEqual([
      '"days" in fr has different placeholders than en: unexpected v.',
      '"hi" in fr has different placeholders than en: missing name.',
    ])
  })
})

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
})

// Cases that i18n-ally-next fixed after the fork of i18n-ally.
describe('namespaces', () => {
  it('react-i18next: folders, keyPrefix, flat dotted keys and withTranslation', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('react-i18next', 'i18next'),
      'locales/en/translation.json': json({ 'common.stackTrace': 'Stack', 'title': 'T' }),
      'locales/en/errors.json': json({ notFound: 'Not found' }),
      'locales/en/pages/home.json': json({ title: 'Home', foo: { bar: { baz: 'B' } } }),
      'src/A.tsx': [
        `function A() { const { t } = useTranslation(); return t('common.stackTrace') + t('errors:notFound') }`,
        `function B() { const { t } = useTranslation('pages/home', { keyPrefix: 'foo.bar' }); return t('baz') + t('translation:title') }`,
        `function C() { const { t } = useTranslation('pages/home'); return t('title') + t('pages/home:foo.bar.baz') }`,
      ].join('\n'),
      'src/D.tsx': `function D({ t }) { return t('notFound') }\nexport default withTranslation('errors')(D)\n`,
    }, { resources: [{ pattern: 'locales/{locale}/{namespaces}.json' }], keyStyle: 'flat' })
    expect(project.usages().map(m => m.usage.key)).toEqual([
      'translation:common.stackTrace',
      'errors:notFound',
      'pages/home:foo.bar.baz',
      'translation:title',
      'pages/home:title',
      'pages/home:foo.bar.baz',
      'errors:notFound',
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

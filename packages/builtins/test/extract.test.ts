import type { Project } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { extractableHardStrings, extractItems, findCandidates, shouldExtract, slugify } from '../src/extractors'
import { reactI18next, reactIntl, svelteI18n, vueI18n } from '../src/presets'
import { createTestProject, json } from './_utils'

async function extractAll(project: Project): Promise<void> {
  const items = extractItems(project, findCandidates(project))
  await project.apply(project.plan([{ type: 'extract', items }]))
}

describe('extraction rules', () => {
  it('generates bare camelCase slugs', () => {
    expect(slugify('Forgot password?')).toBe('forgotPassword')
    expect(slugify('Forgot password?', 'snake')).toBe('forgot_password')
    expect(slugify('Ça va très bien')).toBe('caVaTresBien')
  })

  it('folds rule scores', () => {
    expect(shouldExtract('Hello world', 'js-string')).toBe(true)
    expect(shouldExtract('click', 'js-string')).toBe(false)
    expect(shouldExtract('Save', 'jsx-text')).toBe(true)
    expect(shouldExtract('https://x.dev', 'jsx-text')).toBe(false)
    expect(shouldExtract('some-class-name', 'jsx-attribute')).toBe(false)
    expect(shouldExtract('你好', 'js-string')).toBe(true)
    expect(shouldExtract('SCREAMING_CASE', 'jsx-text')).toBe(false)
  })

  it('skips class lists, SVG paths and text-free markup', () => {
    expect(shouldExtract('!color-base underline underline-offset-6', 'js-string')).toBe(false)
    expect(shouldExtract('flex items-center gap-2 hover:bg-gray/10', 'js-string')).toBe(false)
    expect(shouldExtract('M5.5 0v11M0 5.5h11', 'js-string')).toBe(false)
    expect(shouldExtract('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} {1}">{2}</svg>', 'js-template')).toBe(false)
    expect(shouldExtract('<b>Save</b> your changes', 'js-string')).toBe(true)
    expect(shouldExtract('well-known issue', 'js-string')).toBe(true)
    expect(shouldExtract('Move to trash', 'js-string')).toBe(true)
  })

  it('skips attributify utilities on text props and CSS values', () => {
    expect(shouldExtract('xs secondary', 'vue-attribute', undefined, 'text')).toBe(false)
    expect(shouldExtract('lg', 'vue-attribute', undefined, 'sm:text')).toBe(false)
    expect(shouldExtract('Save changes', 'vue-attribute', undefined, 'text')).toBe(true)
    expect(shouldExtract('repeating-linear-gradient(to right,var(--c-primary) 0%,var(--c-primary-active) 100%)', 'js-string')).toBe(false)
    expect(shouldExtract('calc(100% - 2rem)', 'js-string')).toBe(false)
  })

  it('extracts only text attributes from markup', async () => {
    const tag = '<component as="RouterLink" flex="~ col gap-2" border="b base" w="sm:1/2 full" color="var(--c-primary)" enter-from-class="opacity-0" text="xs secondary" title="Open menu" aria-label="Close dialog" confirm-text="Yes please" empty-state="Nothing here">Hidden</component>'
    const { project } = await createTestProject({
      'locales/en.json': json({}),
      'src/App.vue': `<template>\n  ${tag}\n</template>\n`,
      'src/App.tsx': `export const App = () => ${tag.replace('enter-from-class', 'className')}\n`,
      'src/App.svelte': `${tag.replace('enter-from-class', 'class')}\n`,
    }, { presets: [vueI18n(), svelteI18n()], extract: { attributes: ['empty-state'] } })
    expect(findCandidates(project).map(c => `${c.path}:${c.attribute ?? c.kind}`)).toEqual([
      'src/App.svelte:title',
      'src/App.svelte:aria-label',
      'src/App.svelte:confirm-text',
      'src/App.svelte:empty-state',
      'src/App.svelte:svelte-text',
      'src/App.tsx:title',
      'src/App.tsx:aria-label',
      'src/App.tsx:confirm-text',
      'src/App.tsx:empty-state',
      'src/App.tsx:jsx-text',
      'src/App.vue:title',
      'src/App.vue:aria-label',
      'src/App.vue:confirm-text',
      'src/App.vue:empty-state',
      'src/App.vue:vue-template-text',
    ])
  })
})

describe('config ignores', () => {
  it('skips exact strings and /regex/ from extract.ignore and extract.ignoreByFile', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({}),
      'src/a.ts': 'export const a = [\'Hello there\', \'Brand Name\', \'TODO: later\', \'Kept text\']',
      'src/b.ts': 'export const b = [\'Only here\', \'Brand Name\']',
    }, { extract: { ignore: ['Brand Name', '/^todo:/i'], ignoreByFile: { 'src/b.ts': ['Only here'] } } })
    expect(findCandidates(project).map(c => c.text)).toEqual(['Hello there', 'Kept text'])
  })
})

describe('skipped files and control comments', () => {
  const line = 'export const a = \'Hello there\''

  it('skips tests, fixtures, stories, configs and declarations in any language', () => {
    const skipped = [
      'src/a.test.ts',
      'src/a.spec.tsx',
      'src/__tests__/a.ts',
      'src/Button.stories.vue',
      'e2e/login.ts',
      'cypress/support/a.js',
      'src/env.d.ts',
      'vite.config.ts',
      'src/config.ts',
      'handler_test.go',
      'testdata/a.go',
      'tests/test_views.py',
      'app/test_views.py',
      'app/tests.py',
      'conftest.py',
      'spec/models/user_spec.rb',
      'test/user_test.exs',
      'src/test/java/app/UserTest.java',
      'app/src/main/java/app/UserIT.java',
      'Tests/UserTests.swift',
      'tests/Feature/LoginTest.php',
      'lib/widget_test.dart',
    ]
    const kept = ['src/App.vue', 'src/configure.ts', 'src/Latest.vue', 'app/views.py', 'app/Contest.java', 'src/protest.ts', 'lib/spectrum.dart']
    const hard = [...skipped, ...kept].map(path => ({ path, text: 'Hello there', kind: 'js-string', range: { start: 0, end: 13 } }))
    expect([...extractableHardStrings({}, hard, () => '')].map(h => h.path)).toEqual(kept)
  })

  it('honours x18n-ignore-file, x18n-ignore-start/end and x18n-ignore', async () => {
    const { project } = await createTestProject({
      'locales/en.json': json({}),
      'src/whole.ts': `// x18n-ignore-file\n${line}`,
      'src/parts.ts': [
        'export const a = \'Kept first\'',
        '// x18n-ignore-start',
        'export const b = \'Skipped region\'',
        'export const c = \'Skipped too\'',
        '// x18n-ignore-end',
        'export const d = \'Kept after end\'',
        'export const e = \'Skipped line\' // x18n-ignore',
        '// x18n-ignore',
        'export const f = \'Skipped next\'',
        'export const g = \'Kept last\'',
      ].join('\n'),
    })
    expect(findCandidates(project).map(c => c.text)).toEqual(['Kept first', 'Kept after end', 'Kept last'])
  })
})

describe('extraction per preset', () => {
  it('vue-i18n: template text, attributes and script strings', async () => {
    const { project, files } = await createTestProject({
      'src/locales/en.json': json({ existing: 'Already here' }),
      'src/App.vue': [
        '<script setup lang="ts">',
        'const label = \'Click to continue\'',
        '</script>',
        '',
        '<template>',
        '  <h1 title="Main title">Welcome back</h1>',
        '  <p>Already here</p>',
        '  <!-- x18n-ignore -->',
        '  <p>Ignored text</p>',
        '</template>',
      ].join('\n'),
    }, { presets: [vueI18n()] })
    const candidates = findCandidates(project)
    expect(candidates.map(c => `${c.kind}:${c.key}${c.reused ? '*' : ''}`)).toEqual([
      'js-string:clickToContinue',
      'vue-attribute:mainTitle',
      'vue-template-text:welcomeBack',
      'vue-template-text:existing*',
    ])
    await extractAll(project)
    expect(files.get('src/App.vue')).toBe([
      '<script setup lang="ts">',
      'import { useI18n } from \'vue-i18n\'',
      'const { t } = useI18n()',
      'const label = t(\'clickToContinue\')',
      '</script>',
      '',
      '<template>',
      '  <h1 :title="$t(\'mainTitle\')">{{ $t(\'welcomeBack\') }}</h1>',
      '  <p>{{ $t(\'existing\') }}</p>',
      '  <!-- x18n-ignore -->',
      '  <p>Ignored text</p>',
      '</template>',
    ].join('\n'))
    expect(JSON.parse(files.get('src/locales/en.json')!)).toEqual({ existing: 'Already here', clickToContinue: 'Click to continue', mainTitle: 'Main title', welcomeBack: 'Welcome back' })
  })

  it('react-i18next: JSX text through Trans, attributes through i18next.t, template arguments', async () => {
    const { project, files } = await createTestProject({
      'locales/en/translation.json': json({}),
      'src/App.tsx': 'export const A = () => <p aria-label="x" title="Close dialog">Hello there</p>\nconst msg = `Signed in as ${user.name}`\n', // eslint-disable-line no-template-curly-in-string
    }, { presets: [reactI18next()], resources: [{ pattern: 'locales/{locale}/{namespace}.json' }] })
    await extractAll(project)
    expect(files.get('src/App.tsx')).toBe([
      'import i18next from \'i18next\'',
      'import { Trans } from \'react-i18next\'',
      'export const A = () => <p aria-label="x" title={i18next.t(\'closeDialog\')}><Trans i18nKey="helloThere" /></p>',
      'const msg = i18next.t(\'signedInAs\', { name: user.name })',
      '',
    ].join('\n'))
    expect(JSON.parse(files.get('locales/en/translation.json')!)).toEqual({ closeDialog: 'Close dialog', helloThere: 'Hello there', signedInAs: 'Signed in as {{name}}' })
  })

  it('escapes source-text keys for the quotes of each template', async () => {
    const { project: react } = await createTestProject({
      'locales/en/translation.json': json({}),
      'src/App.tsx': 'export function A() {\n  const label = "Don\'t stop now"\n  return <p>Say "hi" there</p>\n}\n',
    }, { presets: [reactI18next()], resources: [{ pattern: 'locales/{locale}/{namespace}.json' }], extract: { keygen: 'source' } })
    expect(findCandidates(react).map(c => c.replacement)).toEqual([
      'i18next.t(\'Don\\\'t stop now\')',
      '<Trans i18nKey="Say &quot;hi&quot; there" />',
    ])
    const { project: vue } = await createTestProject({
      'src/locales/en.json': json({}),
      'src/App.vue': '<template>\n  <p title="It\'s here now">Don\'t stop now</p>\n</template>\n',
    }, { presets: [vueI18n()], extract: { keygen: 'source' } })
    expect(findCandidates(vue).map(c => c.replacement)).toEqual([
      ':title="$t(\'It\\\'s here now\')"',
      '{{ $t(\'Don\\\'t stop now\') }}',
    ])
  })

  it('react-intl: FormattedMessage and formatMessage', async () => {
    const { project, files } = await createTestProject({
      'lang/en.json': json({}),
      'src/App.tsx': 'const A = () => <button>Save changes</button>\n',
    }, { presets: [reactIntl()], resources: [{ pattern: 'lang/{locale}.json' }] })
    await extractAll(project)
    expect(files.get('src/App.tsx')).toBe('import { FormattedMessage } from \'react-intl\'\nconst A = () => <button><FormattedMessage id="saveChanges" /></button>\n')
  })

  it('refuses a plan whose source changed', async () => {
    const { project, files } = await createTestProject({
      'lang/en.json': json({}),
      'src/App.tsx': 'const a = \'Some text here\'\n',
    }, { resources: [{ pattern: 'lang/{locale}.json' }] })
    const candidates = findCandidates(project)
    files.set('src/App.tsx', 'const a = \'Other text here\'\n')
    await project.update([{ type: 'change', path: 'src/App.tsx' }])
    expect(() => extractItems(project, candidates)).toThrow(expect.objectContaining({ code: 'X18N4004' }))
  })
})

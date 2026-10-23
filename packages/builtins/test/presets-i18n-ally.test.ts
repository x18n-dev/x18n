import type { Project } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { phpGettext } from '../src/presets/php-gettext'
import { createTestProject, json } from './_utils'

function pkg(...deps: string[]): string {
  return json({
    dependencies: Object.fromEntries(deps.map(dep => [dep, '*'])),
  })
}

function detected(project: Project): string[] {
  return project.explain().presets.filter(p => p.reason === 'detected').map(p => p.name).filter(name => name !== 'general')
}

function usedKeys(project: Project): (string | undefined)[] {
  return project.usages().map(m => m.usage.key)
}

describe('every i18n-ally framework is detected and understood', () => {
  it('ngx-translate', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@angular/core', '@ngx-translate/core'),
      'src/assets/i18n/en.json': json({
        home: { title: 'Home', sub: 'Sub', save: 'Save' },
      }),
      'src/app/app.component.html': '<h1>{{ \'home.title\' | translate }}</h1>\n<p [translate]="\'home.sub\'"></p>',
      'src/app/app.component.ts': 'this.translate.instant(\'home.save\')',
    })
    expect(detected(project)).toEqual(['ngx-translate'])
    expect(usedKeys(project).sort()).toEqual(['home.save', 'home.sub', 'home.title'])
  })

  it('transloco, with read scopes', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@jsverse/transloco'),
      'src/assets/i18n/en.json': json({
        title: 'T',
        admin: { users: 'U' },
      }),
      'src/app/a.html': '<h1>{{ \'title\' | transloco }}</h1>\n<div *transloco="let t; read: \'admin\'"><p>{{ t(\'users\') }}</p></div>',
    })
    expect(detected(project)).toEqual(['transloco'])
    expect(usedKeys(project)).toEqual(['title', 'admin.users'])
    expect(project.analyze().unused).toEqual([])
  })

  it('next-international with scoped factories and TS locale files', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('next-international'),
      'locales/en.ts': 'export default {\n  hello: \'Hello {name}\',\n  settings: { title: \'Settings\' },\n} as const\n',
      'app/page.tsx': 'const t = useI18n()\nconst scopedT = useScopedI18n(\'settings\')\nt(\'hello\', { name }); scopedT(\'title\')',
    })
    expect(detected(project)).toEqual(['next-international'])
    expect(project.keys()).toEqual(['hello', 'settings.title'])
    expect(usedKeys(project)).toEqual(['hello', 'settings.title'])
  })

  it('next-translate namespaces', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('next-translate'),
      'locales/en/common.json': json({ title: 'T' }),
      'locales/en/home.json': json({ intro: 'I' }),
      'pages/index.tsx': 'const { t } = useTranslation(\'home\')\nt(\'intro\'); t(\'common:title\')',
    })
    expect(usedKeys(project)).toEqual(['home:intro', 'common:title'])
    expect(project.analyze().unused).toEqual([])
  })

  it('i18next-shopify nested plural forms', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@shopify/i18next-shopify', 'react-i18next'),
      'locales/en.json': json({
        cart: {
          items: { one: '{count} item', other: '{count} items' },
        },
      }),
      'src/a.tsx': 'const { t } = useTranslation()\nt(\'cart.items\', { count })',
    }, {
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    })
    expect(detected(project)).toContain('i18next-shopify')
    expect(project.analyze().unused).toEqual([])
  })

  it('i18next-shopify: each locale needs its own plural categories', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@shopify/i18next-shopify', 'react-i18next'),
      'locales/en.json': json({
        cart: {
          items: { one: '{count} item', other: '{count} items' },
        },
      }),
      'locales/ja.json': json({
        cart: {
          items: { other: '{count} 個' },
        },
      }),
      'locales/pl.json': json({
        cart: {
          items: { one: '{count} produkt', other: '{count} produktu' },
        },
      }),
      'src/a.tsx': 'const { t } = useTranslation()\nt(\'cart.items\', { count })',
    }, {
      resources: [
        { pattern: 'locales/{locale}.json' },
      ],
    })
    const missing = Object.fromEntries(project.analyze().coverage.map(c => [c.locale, c.missing]))
    expect(missing).toEqual({
      en: [],
      ja: [],
      pl: ['cart.items.few', 'cart.items.many'],
    })
  })

  it('i18n-tag tagged templates', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('es2015-i18n-tag'),
      'locales/en.json': json({ Hello: 'Hello' }),
      'src/a.js': 'const x = i18n`Hello`',
    })
    expect(usedKeys(project)).toEqual(['Hello'])
  })

  it('fluent-vue with ftl files and <fluent> blocks', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('fluent-vue'),
      'locales/en.ftl': 'hello = Hello { $name }\nbye = Bye\n',
      'locales/de.ftl': 'hello = Hallo\n',
      'src/App.vue': '<template><p>{{ $t(\'hello\', { name }) }}</p></template>\n<fluent locale="en">\nlocal = Local\n</fluent>\n',
    })
    expect(detected(project)).toEqual(['fluent-vue'])
    expect(project.keys()).toEqual(['bye', 'hello', 'local'])
    expect(project.analyze().diagnostics.map(d => `${d.code}:${d.key}`)).toContain('placeholder-mismatch:hello')
  })

  it('polyglot, globalize, i18n-js and ember-intl', async () => {
    const cases: [string, string, string, string][] = [
      [
        'node-polyglot',
        'src/a.js',
        'polyglot.t(\'a.b\')',
        'polyglot',
      ],
      [
        'globalize',
        'src/a.js',
        'Globalize.formatMessage(\'a/b\')',
        'globalize',
      ],
      [
        'i18n-js',
        'src/a.js',
        'I18n.t(\'a.b\')',
        'i18n-js',
      ],
      [
        'ember-intl',
        'app/templates/a.hbs',
        '<h1>{{t \'a.b\'}}</h1>',
        'ember-intl',
      ],
    ]
    for (const [dep, path, code, preset] of cases) {
      const { project } = await createTestProject({
        'package.json': pkg(dep),
        'translations/en.json': json({
          a: { b: 'x' },
        }),
        [path]: code,
      })
      expect(detected(project), dep).toEqual([preset])
      expect(usedKeys(project), dep).toEqual(['a.b'])
    }
  })

  it('ui5 properties bundles', async () => {
    const { project } = await createTestProject({
      'package.json': json({
        devDependencies: { '@ui5/cli': '*' },
      }),
      'webapp/i18n/i18n.properties': 'appTitle=App\nhello=Hello {0}\n',
      'webapp/i18n/i18n_de.properties': 'appTitle=Anwendung\n',
      'webapp/view/Main.view.xml': '<Page title="{i18n>appTitle}"/>',
      'webapp/controller/Main.controller.js': 'this.getResourceBundle().getText(\'hello\')',
    })
    expect(project.locales).toEqual(['en', 'de'])
    expect(usedKeys(project).sort()).toEqual(['appTitle', 'hello'])
  })

  it('lingui po catalogs keyed by message', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('@lingui/core', '@lingui/react'),
      'src/locales/en/messages.po': 'msgid "Hello"\nmsgstr "Hello"\n\nmsgid "welcome"\nmsgstr "Welcome"\n',
      'src/a.tsx': 'const a = t`Hello`\nconst b = <Trans id="welcome" />',
    })
    expect(detected(project)).toEqual(['lingui'])
    expect(usedKeys(project).sort()).toEqual(['Hello', 'welcome'])
  })

  it('chrome extensions: _locales, getMessage, __MSG__ and the default locale', async () => {
    const { project, files } = await createTestProject({
      'manifest.json': json({ default_locale: 'de', name: '__MSG_appName__' }),
      '_locales/de/messages.json': json({
        appName: { message: 'App', description: 'Name' },
        hello: { message: 'Hallo $user$' },
      }),
      '_locales/en/messages.json': json({
        appName: { message: 'App' },
      }),
      'src/popup.js': 'chrome.i18n.getMessage(\'hello\')',
    })
    expect(detected(project)).toEqual(['chrome-extension'])
    expect(project.sourceLocale).toBe('de')
    expect(project.keys()).toEqual(['appName', 'hello'])
    expect(usedKeys(project).sort()).toEqual(['appName', 'hello'])
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'hello',
        locale: 'en',
        value: 'Hello $user$',
      },
    ]))
    expect(JSON.parse(files.get('_locales/en/messages.json')!)).toEqual({
      appName: { message: 'App' },
      hello: { message: 'Hello $user$' },
    })
  })

  it('laravel php arrays, json strings and nested files', async () => {
    const { project } = await createTestProject({
      'composer.json': json({
        require: { 'laravel/framework': '^11' },
      }),
      'lang/en/auth.php': '<?php\n\nreturn [\n    \'failed\' => \'These credentials do not match.\',\n];\n',
      'lang/en/admin/users.php': '<?php return [\'title\' => \'Users :count\'];',
      'lang/en.json': json({ 'Welcome back!': 'Welcome back!' }),
      'resources/views/a.blade.php': '{{ __(\'auth.failed\') }} @lang(\'admin/users.title\') {{ __(\'Welcome back!\') }}',
    })
    expect(detected(project)).toEqual(['laravel'])
    expect(usedKeys(project)).toEqual(['auth.failed', 'admin.users.title', 'Welcome back!'])
    expect(project.analyze().undefinedUsages).toEqual([])
  })

  it('joomla ini files', async () => {
    const { project } = await createTestProject({
      'composer.json': json({
        require: { 'joomla/application': '*' },
      }),
      'language/en-GB/en-GB.com_demo.ini': 'COM_DEMO_TITLE="Demo"\n',
      'site/view.php': '<?php echo Text::_(\'COM_DEMO_TITLE\'); ?>',
    })
    expect(detected(project)).toEqual(['php-joomla'])
    expect(usedKeys(project)).toEqual(['COM_DEMO_TITLE'])
  })

  it('php gettext when listed', async () => {
    const { project } = await createTestProject({
      'locale/de/LC_MESSAGES/messages.po': 'msgid "Hello"\nmsgstr "Hallo"\n',
      'index.php': '<?php echo gettext("Hello"); echo _("Missing");',
    }, {
      presets: [
        phpGettext(),
      ],
      sourceLocale: 'de',
    })
    expect(usedKeys(project)).toEqual(['Hello', 'Missing'])
  })

  it('ruby on rails: top-level locale, lazy lookups, symbols', async () => {
    const { project, files } = await createTestProject({
      'Gemfile': 'source "https://rubygems.org"\ngem "rails", "~> 7.1"\n',
      'config/locales/en.yml': 'en:\n  users:\n    index:\n      title: Users\n  hello: Hello %{name}\n',
      'config/locales/de.yml': 'de:\n  hello: Hallo\n',
      'app/views/users/index.html.erb': '<h1><%= t(".title") %></h1>\n<p><%= t(:hello) %></p>',
    })
    expect(detected(project)).toEqual(['ruby-rails'])
    expect(project.keys()).toEqual(['hello', 'users.index.title'])
    expect(usedKeys(project)).toEqual(['users.index.title', 'hello'])
    expect(project.analyze().diagnostics.map(d => `${d.code}:${d.key}`)).toContain('placeholder-mismatch:hello')
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'users.index.title',
        locale: 'de',
        value: 'Benutzer',
      },
    ]))
    expect(files.get('config/locales/de.yml')).toContain('de:\n  hello: Hallo\n  users:\n    index:\n      title: Benutzer')
  })

  it('jekyll', async () => {
    const { project } = await createTestProject({
      'Gemfile': 'gem \'jekyll-multiple-languages-plugin\'\n',
      '_i18n/en.yml': 'nav:\n  home: Home\n',
      'index.html': '<a>{% t nav.home %}</a>',
    })
    expect(detected(project)).toEqual(['jekyll'])
    expect(usedKeys(project)).toEqual(['nav.home'])
  })

  it('flutter_i18n', async () => {
    const { project } = await createTestProject({
      'pubspec.yaml': 'name: app\ndependencies:\n  flutter_i18n: ^0.36.0\n',
      'assets/flutter_i18n/en.json': json({ title: 'T', greet: 'Hi {name}' }),
      'lib/main.dart': 'Text(FlutterI18n.translate(context, "title")); I18nText("greet")',
    })
    expect(detected(project)).toEqual(['flutter'])
    expect(usedKeys(project)).toEqual(['title', 'greet'])
  })

  it('sveltekit-i18n uses the svelte preset', async () => {
    const { project } = await createTestProject({
      'package.json': pkg('sveltekit-i18n'),
      'src/lib/translations/en/common.json': json({ title: 'T' }),
      'src/routes/+page.svelte': '<h1>{$t(\'common.title\')}</h1>',
    })
    expect(detected(project)).toEqual(['svelte-i18n'])
  })
})

import type { Project } from '@x18n/core'
import { describe, expect, it } from 'vitest'
import { pyprojectToml, requirementsTxt } from '../src/manifests'
import { createTestProject } from './_utils'

function detected(project: Project): string[] {
  return project.explain().presets.filter(p => p.reason === 'detected').map(p => p.name).filter(name => name !== 'general')
}

function usedKeys(project: Project): (string | undefined)[] {
  return project.usages().map(m => m.usage.key)
}

describe('python manifests', () => {
  it('pyproject.toml: PEP 621, optional groups and Poetry tables', () => {
    const text = [
      '[project]',
      'name = "app"',
      'description = """',
      '[not a table]',
      '"""',
      'dependencies = [',
      '  "Django>=5.0", # web',
      '  "i18nice[YAML]>=0.15",',
      '  \'Flask_Babel ; python_version > "3.8"\',',
      ']',
      'classifiers = ["Framework :: Django"]',
      '',
      '[project.optional-dependencies]',
      'docs = ["Sphinx"]',
      '',
      '[tool.poetry.dependencies]',
      'python = "^3.11"',
      'python-i18n = { version = "^0.3", extras = ["yaml"] }',
      '"zope.interface" = "^5"',
      'requests.version = "^2"',
      '',
      '[tool.poetry.group.dev.dependencies]',
      'pytest = "*"',
      '',
      '[tool.ruff]',
      'line-length = 100',
      'notes = \'\'\'',
      '[tool.poetry.dependencies]',
      'fake = "1"',
      '\'\'\'',
    ].join('\n')
    expect(pyprojectToml.read(text)).toEqual([
      'django',
      'i18nice',
      'flask-babel',
      'sphinx',
      'python-i18n',
      'zope-interface',
      'requests',
      'pytest',
    ])
  })

  it('requirements.txt: names before versions, extras and markers', () => {
    const text = '# app\n-r base.txt\n-e .\nDjango==5.0.1\ni18nice[YAML] >= 0.15\nflask.babel~=4.0 ; python_version >= "3.8"\n\n'
    expect(requirementsTxt.read(text)).toEqual(['django', 'i18nice', 'flask-babel'])
  })
})

describe('python-gettext', () => {
  it('django: po catalogs, gettext calls and template tags', async () => {
    const { project } = await createTestProject({
      'requirements.txt': 'Django>=5.0\n',
      'locale/de/LC_MESSAGES/django.po': 'msgid "Welcome, %(name)s!"\nmsgstr "Willkommen!"\n\nmsgid "One apple"\nmsgid_plural "%(count)d apples"\nmsgstr[0] "Ein Apfel"\nmsgstr[1] "%(count)d Äpfel"\n\nmsgid "Log out"\nmsgstr "Abmelden"\n',
      'shop/views.py': [
        'from django.utils.translation import gettext as _, gettext_lazy, ngettext',
        'title = gettext_lazy(\'Log out\')',
        'msg = _("Welcome, %(name)s!") % {"name": name}',
        'n = ngettext("One apple", "%(count)d apples", count)',
        'skipped = _("a" "b"), _(f"Hi {name}")',
      ].join('\n'),
      'shop/templates/base.html': '{% load i18n %}<a>{% translate "Log out" %}</a> {% trans \'Help\' as help %} {% translate "x" context "menu" %}',
    })
    expect(detected(project)).toEqual(['python-gettext'])
    expect(project.keys()).toEqual(['Log out', 'One apple', 'Welcome, %(name)s!'])
    expect(usedKeys(project).sort()).toEqual([
      'Help',
      'Log out',
      'Log out',
      'One apple',
      'Welcome, %(name)s!',
    ])
    expect(project.analyze().diagnostics.map(d => `${d.code}:${d.key}`)).toContain('missing-key:Help')
  })

  it('babel alone is not detected, as it is also an npm package', async () => {
    const { project } = await createTestProject({ 'package.json': '{"devDependencies":{"babel":"^6"}}', 'requirements.txt': 'Babel\n' })
    expect(detected(project)).toEqual([])
  })

  it('url escapes are not placeholders', async () => {
    const { project } = await createTestProject({
      'requirements.txt': 'Django\n',
      'locale/en/LC_MESSAGES/django.po': 'msgid "x"\nmsgstr "Read a%2Fb at https://x.com/%20and/?q=%s, %2d %(n)s"\n',
      'locale/de/LC_MESSAGES/django.po': 'msgid "x"\nmsgstr "Lies %s, %2d %(n)s"\n',
    })
    expect(project.analyze().diagnostics.filter(d => d.code === 'placeholder-mismatch')).toEqual([])
  })

  it('flask-babel: translations dir and lazy_gettext', async () => {
    const { project } = await createTestProject({
      'pyproject.toml': '[project]\ndependencies = ["flask-babel"]\n',
      'app/translations/fr/LC_MESSAGES/messages.po': 'msgid "Sign in"\nmsgstr "Connexion"\n',
      'app/forms.py': 'label = lazy_gettext("Sign in")',
    })
    expect(detected(project)).toEqual(['python-gettext'])
    expect(usedKeys(project)).toEqual(['Sign in'])
    expect(project.analyze().unused).toEqual([])
  })
})

describe('i18nice', () => {
  it('namespaced files with a locale root, i18n.t and t', async () => {
    const { project, files } = await createTestProject({
      'requirements.txt': 'i18nice[YAML]\n',
      'translations/foo.en.yml': 'en:\n  hi: Hello %{name} !\n  mail:\n    one: One mail\n    many: "%{count} mails"\n',
      'translations/admin/users.en.json': '{\n  "en": {\n    "title": "Users"\n  }\n}\n',
      'translations/foo.de.yml': 'de:\n  hi: Hallo !\n',
      'app.py': 'import i18n\nfrom i18n import t\ni18n.t("foo.hi", name="Bob")\nt(\'admin.users.title\')\ni18n.t("foo.mail", count=2)',
    })
    expect(detected(project)).toEqual(['i18nice'])
    expect(project.keys()).toEqual([
      'admin.users.title',
      'foo.hi',
      'foo.mail.many',
      'foo.mail.one',
    ])
    expect(usedKeys(project)).toEqual(['foo.hi', 'admin.users.title', 'foo.mail'])
    const analysis = project.analyze()
    expect(analysis.unused).toEqual([])
    expect(analysis.diagnostics.filter(d => d.code !== 'missing-translation').map(d => `${d.code}:${d.key}`)).toEqual(['placeholder-mismatch:foo.hi'])
    await project.apply(project.plan([
      {
        type: 'set',
        key: 'foo.hi',
        locale: 'de',
        value: 'Hallo %{name} !',
      },
    ]))
    expect(files.get('translations/foo.de.yml')).toBe('de:\n  hi: Hallo %{name} !\n')
  })
})

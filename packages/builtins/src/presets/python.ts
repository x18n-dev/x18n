// gettext call names adapted from i18n-ally-next (MIT), PR #29 src/frameworks/python.ts
import type { Preset } from '@x18n/core'
import { percentBraces, placeholders, pythonPercent } from '../placeholders'
import { dependsOn, library, localeRoot } from './shared'

// Keys are source messages, so any text but a quote or an escape.
const quoted = [String.raw`"([^"\\\n]+)"`, String.raw`'([^'\\\n]+)'`]
const gettextCall = String.raw`(?<!\w)(?:u?gettext(?:_lazy|_noop)?|lazy_gettext|u?ngettext(?:_lazy)?|lazy_ngettext|_l|_lazy|_)\(\s*`
// The argument must end there, so `_("a" "b")` and `_("a" % x)` are not usages of `a`.
const gettextCalls = quoted.map(string => String.raw`${gettextCall}${string}(?=\s*[,)])`)
// `{% translate "x" context "y" %}` is left out: its key also holds the context.
const djangoTags = quoted.map(string => String.raw`\{%\s*trans(?:late)?\s+${string}(?=\s*(?:noop\s*)?(?:as\s+\w+\s*)?%\})`)

/** gettext in Python (Django, Flask-Babel, Babel): `.po` catalogs, `_()`, `gettext()`, `ngettext()` and Django `{% translate %}`. */
export function pythonGettext(): Preset {
  return {
    name: 'python-gettext',
    detect: dependsOn(['django', 'flask-babel']),
    plugins: [
      library({
        name: 'python-gettext',
        regex: [
          { extensions: ['py'], patterns: gettextCalls },
          { extensions: ['html', 'jinja', 'jinja2', 'j2'], patterns: [...gettextCalls, ...djangoTags] },
        ],
        resources: [
          { pattern: 'locale/{locale}/LC_MESSAGES/*.po' },
          { pattern: '*/locale/{locale}/LC_MESSAGES/*.po' },
          { pattern: 'translations/{locale}/LC_MESSAGES/*.po' },
          { pattern: '*/translations/{locale}/LC_MESSAGES/*.po' },
        ],
        extra: (draft) => {
          draft.extract = { keygen: 'source', ...draft.extract }
        },
        templates: [{ template: '_("{key}")' }],
      }),
      placeholders(pythonPercent),
    ],
  }
}

/** i18nice and python-i18n, which it forked: `{namespace}.{locale}.yml` files that start with the locale, `i18n.t('namespace.key')`. */
export function i18nice(): Preset {
  return {
    name: 'i18nice',
    detect: dependsOn(['i18nice', 'python-i18n']),
    plugins: [
      library({
        name: 'i18nice',
        regex: [{ extensions: ['py'], patterns: ['(?<![\\w.])(?:i18n\\.)?t\\(\\s*[\'"]({key})[\'"]'] }],
        // The default `filename_format` is `{namespace}.{locale}.{format}`; folders add namespaces too.
        resources: [{ pattern: 'translations/{namespaces}.{locale}.{ext}' }, { pattern: 'locales/{namespaces}.{locale}.{ext}' }],
        // Plural forms are sub-keys of the key passed with `count`.
        derivedKeys: ['{key}.zero', '{key}.one', '{key}.few', '{key}.many'],
        transformResource: localeRoot(ctx => /\.(?:ya?ml|json)$/.test(ctx.path) && ctx.path.slice(0, ctx.path.lastIndexOf('.')).endsWith(`.${ctx.locale}`)),
        templates: [{ template: 'i18n.t(\'{key}\')' }],
      }),
      placeholders(percentBraces),
    ],
  }
}

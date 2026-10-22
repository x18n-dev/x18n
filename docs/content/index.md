---
navigation: false
title: 'x18n: TypeScript, but for i18n'
description: x18n links your locale files to your code like imports. It checks every key like a type checker, and gives you a CLI, a language server, a VS Code extension, a UI and MCP tools on one engine.
---

<!-- eslint-disable markdown/no-missing-atx-heading-space -- `#title` and the like are MDC slot names, not headings. -->

::u-page-hero
---
orientation: horizontal
---
::x18n-demo
::

#title
TypeScript, but for i18n

#description
x18n links your locale files to your code, as if you imported them. It checks every key like a type and tracks every usage like a reference. A CLI, an editor extension, a UI and agent tools give your translations the developer experience of TypeScript.

#links
  :::u-button
  ---
  to: /guide/getting-started
  size: lg
  trailing-icon: i-ph-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: ghost
  size: lg
  to: https://github.com/x18n-dev/x18n
  target: _blank
  ---
  View on GitHub
  :::
::

::landing-features
#headline
The idea

#title
Locale files, linked like imports

#description
A locale file is static data, and a key in `t('settings.title')` is only a string. Nothing connects them, so a typo or a deleted key fails silently at runtime. x18n connects them: it treats each message as a symbol that your code imports, and checks every link.

#default
  :::landing-feature-card{icon="i-ph-check-circle-duotone" to="/surfaces/cli"}
  #title
  Checked like types

  #description
  `x18n check` is `tsc --noEmit` for i18n. It reports missing keys, unused keys and broken placeholders, and fails CI on errors.
  :::

  :::landing-feature-card{icon="i-ph-arrow-square-out-duotone" to="/surfaces/vscode"}
  #title
  Go to definition

  #description
  Jump from `t('settings.title')` to the message in the locale file, as you jump from an import to its source.
  :::

  :::landing-feature-card{icon="i-ph-graph-duotone" to="/surfaces/vscode"}
  #title
  Find references

  #description
  See every usage of a key in the code before you change or delete it. Go to implementation lists the message in every locale.
  :::

  :::landing-feature-card{icon="i-ph-pencil-simple-line-duotone" to="/surfaces/cli"}
  #title
  Safe rename

  #description
  Rename a key in every locale file and every usage at once, like a symbol rename. The file format stays the same.
  :::

  :::landing-feature-card{icon="i-ph-text-aa-duotone" to="/surfaces/vscode"}
  #title
  Completion and hovers

  #description
  Complete keys inside translate calls. Hover a key to see its value in each locale, the way you hover a variable to see its type.
  :::

  :::landing-feature-card{icon="i-ph-lightbulb-duotone" to="/surfaces/vscode"}
  #title
  Quick fixes

  #description
  Add a missing key, copy the source value, or extract a hard-coded string into a key, from the diagnostic itself.
  :::
::

::landing-features
#headline
The toolset

#title
One engine, every place you work

#description
TypeScript is more than a compiler: it is the editor, the checks and the refactors around it. x18n gives you the same set for i18n. Every surface reads the same config and reports the same diagnostics, so the CLI in CI, the editor and the UI always agree.

#default
  :::landing-feature-card{icon="i-ph-terminal-window-duotone" to="/surfaces/cli"}
  #title
  CLI and x18n check

  #description
  `x18n check` reports invalid, untranslated and unused keys like `tsc --noEmit`. Every command has JSON output.
  :::

  :::landing-feature-card{icon="i-ph-code-duotone" to="/surfaces/vscode"}
  #title
  VS Code

  #description
  Translations in place of keys, go to definition, find references and rename across code and every locale file.
  :::

  :::landing-feature-card{icon="i-ph-table-duotone" to="/surfaces/ui"}
  #title
  UI

  #description
  Every key across every locale in one table. Edit values in the browser, or publish a static, read-only report.
  :::

  :::landing-feature-card{icon="i-ph-robot-duotone" to="/agents/workflows"}
  #title
  Agents

  #description
  Translate prompts, safe write commands and MCP tools let an agent translate, check and clean up messages.
  :::

  :::landing-feature-card{icon="i-ph-package-duotone" to="/presets"}
  #title
  Presets

  #description
  One preset for each framework of i18n-ally, detected from your dependencies: vue-i18n, i18next, next-intl, ngx-translate, Laravel, Rails, Flutter and 21 others.
  :::

  :::landing-feature-card{icon="i-ph-puzzle-piece-duotone" to="/plugins"}
  #title
  Plugins

  #description
  Add a library, a file format or a check with a YAML file, or with a typed TypeScript plugin.
  :::
::

::x18n-frameworks
::

::landing-tabs
---
items:
  - icon: i-ph-list-duotone
    title: x18n
    description: The status of the project. Locales with coverage, and the counts of resources, keys and usages.
  - icon: i-ph-check-circle
    title: x18n check
    description: Missing, unused and broken keys, like `tsc --noEmit`. Exits with 1 on errors.
  - icon: i-ph-magnifying-glass-duotone
    title: x18n get
    description: The value of a key in every locale, and where the code uses it.
  - icon: i-ph-pencil-simple-line-duotone
    title: x18n rename
    description: Rename a key in every locale and every usage. Add `--dry-run` to see the diff first.
  - icon: i-ph-table-duotone
    title: x18n ui
    description: Browse and edit every key in the browser. It serves MCP for agents at the same time.
  - icon: i-ph-file-code-duotone
    title: x18n init
    description: Write x18n.config.ts from the detected presets and locale files.
---

#headline
Quick start

#title
No config to start

#description
Run x18n in the root of a project. It detects the i18n library from your dependencies and finds the locale files. [Read the guide](/guide/getting-started).

#code-0
  :x18n-terminal{name="status"}

#code-1
  :x18n-terminal{name="check"}

#code-2
  :x18n-terminal{name="get"}

#code-3
  :x18n-terminal{name="rename"}

#code-4
  :x18n-terminal{name="ui"}

#code-5
  :x18n-terminal{name="init"}
::

::landing-cta
#title
Coming from i18n-ally?

#description
`x18n migrate i18n-ally` converts your settings and custom frameworks into an x18n config.

#links
  :::u-button
  ---
  to: /guide/getting-started
  size: lg
  trailing-icon: i-ph-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  to: /migration
  color: neutral
  variant: subtle
  size: lg
  ---
  Migrate from i18n-ally
  :::
::

---
title: Writing plugins
description: Add support for a library, a file format or a check with a YAML plugin or a TypeScript plugin.
---

Everything that depends on an i18n library or a file format comes from plugins. The built-in [presets](/presets) are plugins too. Write your own plugin when x18n does not know your library, your file format or your conventions.

## YAML or TypeScript

There are two ways to write a plugin:

- A [YAML plugin](/plugins/yaml) is a data file. It covers the common cases: detection, resource patterns, translate calls, regex scanners, scopes, placeholders and extraction templates. It needs no code and no build, and an editor validates it with a JSON Schema. It works in YAML and JSON projects without Node dependencies.
- A [TypeScript plugin](/plugins/typescript) is an object with full access to the plugin API. Use it for a new file format, a new check, a reporter, or any rule that data cannot express.

Start with YAML. When the YAML plugin is not enough, `x18n plugin eject` prints the same plugin in TypeScript. See [Debug a plugin](/plugins/debugging).

## Plugin and preset

A plugin is an object that adds capabilities. A capability is one kind of contribution, such as a format, a scanner or a check. See [Capabilities](/plugins/capabilities).

A preset is a group of plugins with a `detect` function. x18n runs `detect` for the built-in presets when `presets` is `'auto'`, and for a preset inside the plugins of another preset. A preset or plugin that you list in `presets` or `plugins` always applies, and `x18n doctor` shows it as `listed`.

## Load a plugin

List plugins in the `plugins` option of the config. An entry is a path, a package name, `[specifier, options]`, or in TS a plugin object:

```ts [x18n.config.ts]
import { defineConfig } from '@x18n/core'
import acme from './x18n/acme'

export default defineConfig({
  plugins: [
    './x18n/legacy.x18n-plugin.yml',
    'x18n-plugin-po',
    [
      'x18n-plugin-glossary-sync',
      { url: 'https://example.com/terms.json' }
    ],
    acme({ strict: true }),
  ],
})
```

- A path that ends in `.yml` or `.yaml` loads as a YAML plugin.
- Another path, or a package name, is imported as a module. Its default export is a plugin, a preset, or a function that takes the options and returns one.
- Paths are relative to the config file. Package names resolve from the directory of the config file.

Plugins and presets that a module exports load in Node only. A plugin can set `runtime: 'node'` to tell x18n that it needs Node, so that runtimes without Node skip it.

## Names and ids

Each plugin has a `name`. Names are unique, and the built-in plugins use the `x18n:` prefix. Each capability has an `id`, unique within its kind. Two capabilities with the same id stop the load with [X18N1002](/errors/x18n1002), unless the later one sets `override: true`.

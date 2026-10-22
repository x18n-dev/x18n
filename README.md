<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./res/logo-dark.svg">
    <img src="./res/logo-light.svg" alt="x18n" width="96">
  </picture>
</p>

# x18n

Universal toolkits for linting, viewing and managing i18n for any frameworks.

`x18n` is the spiritual successor of [i18n-ally](https://github.com/lokalise/i18n-ally), that generalizes its concepts into a framework-agnostic toolkit that runs everywhere with a more robust and extensible architecture.

## Usages

You can use the `@x18n/cli` package to check, analyze, and manage your i18n resources from the command line.

For example,

```bash
pnpx @x18n/cli
```

would output an overview of the i18n resources,

```bash
pnpx @x18n/cli check
```

would do the linting and checking of your i18n resources, reporting missing keys, or unused keys.

```bash
pnpx @x18n/cli usages nav.keys
```

would list all the usages of the specified key (`nav.keys`) across your project.

You can also run 

```bash
pnpx @x18n/cli ui
```

to have an interactive UI in browser to manage your i18n resources easily.

Additionally, you can also install the [VS Code extension](./packages/vscode) for a rendering the translations directly within the editor, enabling inline translation previews, and providing rich "Go to Definition" and "Find References" support for your i18n keys.

For other editors, you can use the [Language Server](./packages/lsp) to enable similar features.

## Packages

| Package | What it is |
| --- | --- |
| [`@x18n/core`](./packages/core) | Engine that runs in Node and in the browser: domain model, plugin API, analysis, edits |
| [`@x18n/builtins`](./packages/builtins) | Built-in plugins: formats, locale finders, usage scanners, checks, reporters, presets for popular i18n libraries |
| [`@x18n/node`](./packages/node) | Node.js host: file system, config and plugin loading |
| [`@x18n/cli`](./packages/cli) | The CLI, with JSON output for CI and agents |
| [`@x18n/lsp`](./packages/lsp) | Language server for any LSP editor |
| [`@x18n/ui`](./packages/ui) | devframe UI: local dev server, static report, in-browser workspace, VS Code panel, devtools panel |
| [`@x18n/devtools`](./packages/devtools) | The UI as a panel in Vite DevTools, Nuxt DevTools and devframe hubs |
| [`x18n-vscode`](./packages/vscode) | VS Code extension on top of the language server |

## Credits

x18n builds on the ideas of [i18n Ally](https://github.com/lokalise/i18n-ally) and [i18n Ally Next](https://github.com/Lydanne/i18n-ally-next).

## License

[MIT](./LICENSE.md) License © [Anthony Fu](https://github.com/antfu)

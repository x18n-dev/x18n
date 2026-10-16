# Playgrounds

Small projects for trying x18n by hand and for the end-to-end tests in `test/playgrounds.test.ts`. Each one has deliberate problems (a missing key, unused keys, missing translations, a placeholder mismatch, hard-coded strings) so every feature has something to find.

| Playground | Stack | Config |
| --- | --- | --- |
| `vue-vite` | vue-i18n, JSON + YAML, an `<i18n>` block | none (detected) |
| `react-i18next` | react-i18next namespaces, `keyPrefix`, plurals | none |
| `next-intl` | next-intl App Router, ICU | none |
| `laravel` | PHP arrays, JSON strings, Blade | none |
| `rails` | YAML with locale roots, lazy lookups | none |
| `angular` | ngx-translate pipes and `TranslateService` | none |
| `monorepo` | two projects, TS and YAML config | `x18n.config.ts` |
| `i18n-ally` | i18n-ally settings to migrate | `.vscode/settings.json` |

Try them from the repo root after `pnpm build`:

```sh
node packages/cli/bin.mjs check --root playground/vue-vite
node packages/cli/bin.mjs status --root playground/react-i18next
node packages/cli/bin.mjs ui --root playground/next-intl
```

Open a playground folder in VS Code with the extension running (`F5` in `packages/vscode`) to try the language server.

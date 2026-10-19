---
name: x18n
description: Set up and run x18n (`@x18n/cli`) to check and manage a project's translations. Use when the task touches locale files or translation keys - adding, renaming or deleting keys, finding missing or unused keys, translating missing messages, extracting hard-coded strings, keeping a glossary of terms - or when setting up x18n or migrating from i18n-ally.
---

# x18n

x18n reads a project's i18n setup (locale files, translate calls in code) and changes it safely. Work through the `x18n` CLI from `@x18n/cli`: it keeps formatting, key style, file choice and placeholders correct, and every command prints a stable JSON envelope with `--json`.

## Decisions belong to the user

You do the legwork; the user makes the **decisions** that shape the product. Before you act on one of these, stop and ask, with your recommendation and the facts you found:

- the source locale, and which locales the project supports
- key naming and structure: namespaces, nesting, the style of new keys
- a glossary term and its translation per locale, and terms that must stay untranslated (brand and product names)
- tone and formality per locale (German *du* or *Sie*, French *tu* or *vous*)
- deleting keys that look unused, since keys built at runtime look unused too
- renames that touch many files or move keys between namespaces
- turning on checks, and making warnings fail CI with `--strict`

Batch the questions into one message. Routine work needs no question: adding a key you use, translating a missing message, fixing a placeholder.

## Rules

- Change locale files through `x18n set`, `x18n apply`, `x18n rename` and `x18n delete`. The config file (`x18n.config.ts`) is the one i18n file you edit by hand.
- Check a key before you use it in code: `x18n get <key> --json`. Reuse an existing key with the same meaning.
- Keep every placeholder of the source message (`{name}`, `{{count}}`, `%{name}`, `:name`, `%s`, `@:key`).
- Pass `--json` and read the envelope `{ "x18n": 1, "command", "data", "diagnostics", "errors" }`.
- Run renames and deletes with `--dry-run` first, and read the plan.

## Set up x18n

1. Run `npx @x18n/cli doctor` in the project root. Without a config, x18n uses the project's i18n-ally settings if it has any, and detects the i18n library and the locale files. Check the detected presets, the locale files and the source locale. **Done when** the doctor output names the library the project uses and lists every locale file.
2. If the project has i18n-ally settings (`i18n-ally.*` keys in `.vscode/settings.json`), follow [references/migrate-i18n-ally.md](references/migrate-i18n-ally.md) instead of step 3.
3. If detection is wrong or incomplete, run `x18n init` to write `x18n.config.ts`, then fix `resources`, `sourceLocale` or `presets` in it. `x18n init --format yml` writes YAML for projects without Node.js tooling. **Done when** `x18n doctor` shows the right result.
4. Install the CLI as a dev dependency with the project's package manager (`pnpm add -D @x18n/cli`), and add a script such as `"i18n:check": "x18n check"`. Ask the user before you add it to CI.
5. Run `x18n check --json` and report the summary to the user. **Done when** the user has the counts of errors and warnings per check, and has decided what to fix first.

Commands below use `x18n`; without the dev dependency, run them as `npx @x18n/cli <command>`.

## Glossary (terms table)

The `glossary` in the config is the project's terms table. Translate prompts include it, and the `glossary` check reports messages that translate a term differently.

```ts
// x18n.config.ts
import { defineConfig } from '@x18n/core'

export default defineConfig({
  glossary: [
    { term: 'Workspace', translations: { de: 'Arbeitsbereich', fr: 'Espace de travail' } },
    { term: 'x18n', doNotTranslate: true },
    { term: 'Save', translations: { de: 'Speichern' }, note: 'The button label, not "rescue"' },
  ],
  checks: { glossary: 'warning' },
})
```

Maintain it while you work:

- Before you translate, read the current entries: `x18n doctor --json` lists them under `config.glossary`.
- When you meet a term that recurs across messages or has a product meaning, propose an entry to the user, with a translation for each locale.
- Add the entries the user approves, then run `x18n check --only glossary --json` and fix the messages it reports.

## Loops

### Check the project

```sh
x18n check --json
x18n status --json
```

### Add a key while coding

```sh
x18n get settings.title --json
x18n set settings.title --value "Settings" --json
x18n keys --missing de --json --limit 50
```

`x18n set` without `--locale` writes the source locale. Then use the key in code, for example `t('settings.title')`.

### Translate missing messages

```sh
x18n prompt translate --to de --limit 50
```

Follow the prompt. It holds the rules, the glossary, examples of existing translations and the code around each usage. Write `{ "de": { "<key>": "<translation>" } }` to a file, then:

```sh
x18n apply translations.json --json
x18n check --only placeholder-mismatch,invalid-syntax,glossary --locale de --json
```

`x18n apply` refuses values whose placeholders differ from the source and lists them in `data.rejected`. Fix them and apply again. When the prompt reports more keys, continue with `x18n prompt translate --to de --cursor <nextCursor>`.

### Review translations

```sh
x18n prompt review --locale de --limit 50
```

Fix wrong values with `x18n set <key> --locale de --value <text> --json`, and list what you changed and why.

### Clean up

```sh
x18n keys --unused --json
x18n delete old.key --dry-run --json
```

Show the user the unused keys and delete only the ones they confirm: `x18n delete old.key --json`.

### Rename keys

```sh
x18n rename home.title home.heading --dry-run --json
x18n rename home.title home.heading --json
x18n rename pages screens --json
```

A rename updates every locale and every usage in code. Renaming a parent (`pages`) moves every key under it. A rename onto an existing key is refused (exit code 1).

### Extract hard-coded strings

```sh
x18n extract --list --json
x18n extract --plan extract-plan.json
x18n extract --apply extract-plan.json --json
```

Edit the keys in the plan file before you apply it. The proposed keys follow the project's style; ask the user when there is none yet.

## Output

Exit codes:

- `0` success
- `1` `x18n check` found errors, or `x18n apply` rejected values
- `2` usage or config error
- `3` a decision is needed: re-run with `--yes` to accept the defaults
- `4` files changed during the command: run it again

List commands take `--limit` and return `nextCursor`; pass it as `--cursor` to get the next page: `x18n keys --json --limit 100 --cursor 100`.

When `x18n status --json` lists several projects (a monorepo), pass `--project <name>` to write commands.

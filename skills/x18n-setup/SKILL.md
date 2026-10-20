---
name: x18n-setup
description: Set up x18n (`@x18n/cli`) in a project, or migrate it from i18n-ally. Use when a project has no x18n config yet, when x18n detects the wrong locale files or library, when the user asks to add, install or configure x18n, or when `.vscode/settings.json` has `i18n-ally.*` settings.
---

# Set up x18n

x18n reads a project's i18n setup (locale files, translate calls in code) and often needs no config. Set it up by checking what it detects, and write a config only when detection needs help.

## Decisions belong to the user

Before you act on one of these, stop and ask, with your recommendation and the facts you found. Batch the questions into one message.

- the source locale, and which locales the project supports
- the config format: `x18n.config.ts`, or YAML for projects without Node.js tooling
- what an i18n-ally migration drops (see the reference below)
- adding `x18n check` to CI or to a git hook

## Steps

1. Run `npx @x18n/cli doctor` in the project root. Without a config, x18n uses the project's i18n-ally settings if it has any, and detects the i18n library and the locale files. Check the detected presets, the locale files and the source locale. **Done when** the doctor output names the library the project uses and lists every locale file.
2. If the project has i18n-ally settings (`i18n-ally.*` keys in `.vscode/settings.json`), follow [references/migrate-i18n-ally.md](references/migrate-i18n-ally.md) instead of step 3.
3. If detection is wrong or incomplete, run `x18n init` to write `x18n.config.ts`, then fix `resources`, `sourceLocale` or `presets` in it. `x18n init --format yml` writes YAML. **Done when** `x18n doctor` shows the right result.
4. Install the CLI as a dev dependency with the project's package manager (`pnpm add -D @x18n/cli`), and add a script such as `"i18n:check": "x18n check"`. Ask the user before you add it to CI.
5. Run `x18n check --json` and report the summary to the user: errors and warnings per check (`code` of each diagnostic) and coverage per locale. Do not fix anything in this skill. **Done when** the user has the counts and knows that the `x18n-check` skill fixes them.

Without the dev dependency, run commands as `npx @x18n/cli <command>`. In a monorepo, `x18n status --json` lists every project; pass `--project <name>` to pick one.

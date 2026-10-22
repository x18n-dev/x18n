# x18n maintainer guide

x18n views and maintains the i18n files of any project, for humans and agents: an editor-neutral core, a CLI, a language server, a VS Code extension, and a devframe UI. The plan lives in [`plans/`](./plans/README.md). Where code and plan disagree, the code and its tests win, and the plan gets fixed.

## Rules that apply everywhere

- **MUST**, **MUST NOT**, **SHOULD** and **MAY** use RFC 2119 meanings. They mark
  real invariants - layer boundaries, wire contracts, output shapes - not house style.
- Before a PR, all gates MUST pass:
  `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`.
  Commits follow Conventional Commits.
- Names MUST follow [`plans/glossary.md`](./plans/glossary.md) (resource, message, usage, plugin, preset, ...).
- Dependencies go through the pnpm catalogs (`catalog:<name>`); versions MUST NOT be pinned in a `package.json`.

## Boundary invariants

Full list and reasons: [`plans/01-architecture.md`](./plans/01-architecture.md).

- `@x18n/core` MUST NOT import `node:*`, `vscode`, LSP or devframe packages, and MUST NOT name any i18n library or file format.
- `@x18n/builtins` MUST use only the public API of `@x18n/core` and MUST NOT import `node:*`.
- Core MUST NOT prompt or ask; it returns decisions as data and surfaces ask.
- Surfaces (CLI, LSP, UI, extension) reach project state only through the core `Project` API.
- CLI `--json` output, LSP `x18n/*` requests, RPC functions and MCP tools are wire contracts: versioned and covered by schema or snapshot tests.

## Layout

| Path | Package |
| --- | --- |
| `packages/core` | `@x18n/core` |
| `packages/builtins` | `@x18n/builtins` |
| `packages/node` | `@x18n/node` |
| `packages/cli` | `@x18n/cli` |
| `packages/lsp` | `@x18n/lsp` |
| `packages/ui` | `@x18n/ui` (Nuxt SPA in `app/`, devframe node side in `src/node/`) |
| `packages/devtools` | `@x18n/devtools` (the UI in Vite DevTools, Nuxt DevTools and devframe hubs) |
| `packages/vscode` | `x18n-vscode` (private, published to the Marketplace) |
| `docs` | docs site on the comark-docs layer (`x18n.antfu.dev`) |

The root `x18n.config.ts` points x18n at the UI's own messages (`packages/ui/app/locales`), so the repo checks itself.

## Commands

- `pnpm codegen` writes files that typecheck needs (`.nuxt` types, `packages/vscode/src/generated/meta.ts`). It runs on install.
- `pnpm test` builds first; `test/exports.test.ts` snapshots the public API of every published package with tsnapi. Update snapshots with `pnpm test -u` only for intended API changes.
- `pnpm docs` starts the docs site.

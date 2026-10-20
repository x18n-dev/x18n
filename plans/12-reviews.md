# 12 - Reviews (1.x)

Comments, approvals, change requests and suggested values on messages. A port of i18n-ally's review system, moved out of `.vscode/` and made usable from every surface. Reviews ship after 1.0 (M12). `x18n migrate i18n-ally` already converts `.vscode/i18n-ally-reviews.yml` to `.x18n/reviews.yml` in 1.0, so existing reviews carry over.

## Storage

Default file `.x18n/reviews.yml`, tracked in git, so reviews travel with the branch and show up in PR diffs.

```yaml
# yaml-language-server: $schema=https://x18n.antfu.dev/schema/reviews.json
x18n: 1
threads:
  'auth:login.title':
    de:
      - id: r8f2k1
        type: request-change # comment | approve | request-change | suggestion
        author: {name: Ada, email: ada@example.com}
        time: '2026-10-15T09:12:00Z'
        text: Too formal, use "Anmelden".
        suggestion: Anmelden # only for type: suggestion
        resolved: false
```

- Keyed by `KeyString`, then locale. Stable order (sorted keys) so concurrent edits merge well.
- `id` is a short random id, unique within the file.
- Author comes from `host.identity()` (git `user.name` and `user.email` in the node host), or from `--author` / config `review.author`.
- When a key is renamed through x18n, its threads move with it in the same plan. When a key is deleted, its threads are removed in the same plan.
- When a message value changes after an approval, the approval is marked `stale: true`, so reviewers see it needs another look.

## Stale translations

Stale translations come from history providers ([19-history.md](./19-history.md)); git works without any records. Reviews add one more provider, ahead of git, for changes that git cannot see:

```yaml
sources:
  'auth:login.title':
    de: 9f2c1a # hash of the source value when de was last written
```

- Every x18n write of a target value (`set`, `apply`, an accepted suggestion, a translate prompt batch) records the hash of the current source value for that key and locale, in the same plan.
- A recorded hash that matches the current source value makes the target fresh, whatever git says; `x18n review mark-fresh <key> [--locale]` records the current hash without a change.
- Renames and deletes move or drop the records with the threads.

```ts
interface ReviewStore {
  list: (filter: ReviewFilter) => Promise<readonly ReviewThread[]>
  /** Returns operations for the edit planner, so review writes join the same plan as message writes. */
  plan: (op: ReviewOp) => Promise<readonly FileChange[]>
}
```

The YAML store is the built-in `reviewStore`. A plugin can provide another one (for example backed by a remote service). Only one store is active; a second one is a config error unless the config names which one.

## Surfaces

| Surface | Features |
| --- | --- |
| CLI | `x18n review list [--locale] [--open]`, `comment`, `approve`, `request-change`, `suggest --value`, `resolve <id>`, `apply-suggestion <id>`. |
| LSP | Diagnostic `review-changes-requested`; hover shows review state; commands for each operation. |
| VS Code | Comments API threads on usages and resource lines; gutter icon for review state; Reviews view. |
| UI | Thread under each locale value on the key page; `/reviews` page; filter keys by review state. |
| Agents | `x18n prompt review` produces work that ends in `request-change` or `suggest` commands. |

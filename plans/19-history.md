# 19 - History providers and stale translations

A translation is stale when its source message changed after the translation last changed. History providers report when each message last changed, so `stale-translation` works the day x18n is installed, with no records to build up first. Git is the built-in provider. Later providers can read a meta file or an external translation service.

## Capability

A plugin contributes history providers through `histories`. A provider reports timestamps; core decides what is stale, so every provider means the same thing by it.

```ts
interface HistoryProvider {
  readonly id: string
  /** Reads when each message last changed. Undefined when the provider has nothing for this project. */
  readonly load: (ctx: HistoryContext) => Promise<MessageHistory | undefined>
  /** Calls `onChange` when the history changes outside resource files, for example on a commit. */
  readonly watch?: (ctx: HistoryContext, onChange: () => void) => Disposable
}

interface HistoryContext {
  readonly host: Host
  readonly config: ResolvedConfig
  readonly resources: readonly Resource[]
  /** Messages of a resource in another version of its file, read like the current file. */
  readonly messagesIn: (resource: Resource, text: string) => ReadonlyMap<KeyString, MessageLeaf> | undefined
}

interface MessageHistory {
  readonly changes: ReadonlyMap<KeyString, ReadonlyMap<LocaleCode, MessageChange>>
  /** The value a message had at a time, for translate prompts of stale messages. */
  readonly valueAt?: (key: KeyString, locale: LocaleCode, at: number) => MessageLeaf | undefined
}

interface MessageChange {
  /** Milliseconds since the epoch. */
  readonly updatedAt: number
  /** A provider revision such as a commit sha. */
  readonly revision?: string
  readonly author?: string
  /** The value the provider knows. A different current value is a local change. */
  readonly value?: MessageLeaf
}
```

- Providers are asked in order: inline `history.providers` first, then those of plugins in plugin order. For each message the first provider with an entry wins.
- `messagesIn` runs the resource's format and transforms, so providers never parse files. Embedded resources (Vue `<i18n>` blocks) have no history: their block position in old file versions is unknown.
- History loads asynchronously, apart from `ready`: `await project.loadHistory({ watch? })`, then `project.history(key, locale)`, `project.valueAt(key, locale, at)` and `CheckContext.history(key, locale)` read it synchronously. Loading bumps `revision`, so analysis runs again. Surfaces load it only when they show it.
- A current value that differs from the provider's `value` changed locally: `history()` returns `updatedAt: Infinity` for it. Editing a source message flags its translations right away, and editing a translation clears the flag, without reloading history.

## Stale rule

A target message is stale when both it and its source message have an entry and the target's `updatedAt` is earlier than the source's. A commit that changes both leaves the target fresh. A message without an entry is never stale. `LocaleCoverage.outdated` lists stale keys per locale, `stale-translation` (warning) reports each one at the target message, and `x18n check --json` adds an `outdated` count to each coverage entry.

## Git provider

`@x18n/node` registers it (`x18n:git-history`, node only) when the project is inside a git repo. It runs the `git` binary; without one, it logs once and reports nothing.

- It walks the commits that touch the current resource files, newest first, without merges. A file added in a commit that git sees as a rename is followed to its old path.
- Changes are per key and locale across files: in each commit it compares the messages of the changed files of a locale before and after. A key moved to another file with the same value has not changed.
- `updatedAt` is the committer time. `value` is the value at HEAD, so uncommitted edits are local changes.
- `history.git.maxDepth` (commits) and `history.git.since` (a `git log --since` value or a Date) limit the walk. Only changes inside the window count; the state before it is a baseline, so a message unchanged inside the window has no entry.
- A shallow clone has no real history: the provider logs a warning (use `fetch-depth: 0` in CI) and reports nothing.
- Without window options, the result is cached in `host.cache` with its HEAD. When the cached HEAD is an ancestor of the new one, only the new commits are walked.
- `watch` follows `HEAD`, branch refs and `packed-refs`, so commits, checkouts and pulls reload history in the editor.

## Config

```ts
export default defineConfig({
  // or `false`, or `{ providers: [myProvider] }`
  history: {
    git: { maxDepth: 500, since: '1 year ago' }
  },
})
```

`false` turns off every provider. Provider options sit under the provider's key; providers declare theirs on `HistoryConfigs` through declaration merging, so core does not name git.

## Surfaces

| Surface | Feature |
| --- | --- |
| CLI | `x18n check` loads history unless `stale-translation` is off or filtered out. `x18n prompt translate --stale` adds stale messages, with the source text from when the translation last changed. |
| LSP | Loads and watches history. The hover adds when each locale's message changed, its revision, author and an outdated mark. |
| UI | Loads and watches history. The overview splits coverage bars into fresh and outdated and lists the latest changes; the grid flags outdated cells, filters them and sorts by last change; a key shows when each locale changed and, for an outdated translation, the source text then and now; a locale lists its outdated keys and copies a prompt that updates them. |

import type { ErrorInfo } from '../errors'
import type { CapabilityConflict } from '../plugins'
import type { PromptData, PromptOptions } from '../project/prompt'
import type { PresetExplanation } from '../resolve'
import type { ExtractTemplate, ResolvedConfig } from './config'
import type { FileEvent } from './host'
import type {
  Diagnostic,
  EditOp,
  KeyString,
  LocaleCode,
  LocaleInfo,
  Message,
  MessageLeaf,
  NodeRange,
  Resource,
  TextEdit,
  TextRange,
  Usage,
} from './model'
import type { HardString, LocaleCoverage, MessageChange, PlaceholderSyntax, Reporter, ScanResult } from './plugin'

export interface KeyQuery {
  /** Key glob: `*` inside a segment, `**` across segments. */
  readonly glob?: string | undefined
  readonly namespace?: string | undefined
  /** Only keys missing (or empty) in this locale. */
  readonly missing?: LocaleCode | undefined
  /** Only keys without usages. */
  readonly unused?: boolean | undefined
}

export interface UsageMatch {
  readonly usage: Usage
  /** True for prefix usages that may refer to the key. */
  readonly possible: boolean
}

export interface UsageQuery {
  readonly key?: KeyString | undefined
  /** Every usage of a key under this prefix (subtree). */
  readonly prefix?: KeyString | undefined
  readonly path?: string | undefined
}

export interface KeyInfo {
  readonly key: KeyString
  readonly namespace: string | undefined
  readonly path: readonly string[]
  /** One message per locale that has the key, source locale first. */
  readonly messages: readonly Message[]
  readonly missing: readonly LocaleCode[]
  readonly usages: readonly UsageMatch[]
  readonly diagnostics: readonly Diagnostic[]
}

/** The key, or the resource node, under a position. */
export type KeyTarget
  = | { readonly type: 'key', readonly key: KeyString, readonly range: TextRange, readonly source: 'usage' | 'resource', readonly usage?: Usage | undefined }
    | { readonly type: 'subtree', readonly key: KeyString, readonly range: TextRange, readonly source: 'resource' }

/** A key or parent node in a resource file, with its ranges. */
export interface ResourceNode {
  readonly key: KeyString
  readonly range: NodeRange
  /** False for parent objects. */
  readonly leaf: boolean
  readonly locale: LocaleCode
  readonly path: string
}

export interface Analysis {
  readonly revision: number
  readonly diagnostics: readonly Diagnostic[]
  readonly coverage: readonly LocaleCoverage[]
  readonly unused: readonly KeyString[]
  /** Usages whose key is not defined in the source locale. */
  readonly undefinedUsages: readonly Usage[]
}

export interface ProjectExplanation {
  readonly name: string
  readonly root: string
  readonly presets: readonly PresetExplanation[]
  readonly plugins: readonly string[]
  readonly skipped: readonly { readonly name: string, readonly reason: string }[]
  readonly finders: readonly { readonly id: string, readonly resources: readonly string[] }[]
  /** Candidates dropped because an earlier finder already returned the same resource. */
  readonly duplicates: readonly { readonly path: string, readonly finder: string, readonly keptFrom: string }[]
  readonly formats: readonly { readonly id: string, readonly extensions: readonly string[], readonly resources: number }[]
  readonly scanners: readonly { readonly id: string, readonly extensions: readonly string[], readonly files: number }[]
  readonly conflicts: readonly CapabilityConflict[]
  readonly errors: readonly (ErrorInfo & { readonly path?: string | undefined })[]
  readonly config: ResolvedConfig
}

export type FileChange
  = | { readonly type: 'edit', readonly path: string, readonly edits: readonly TextEdit[] }
    | { readonly type: 'create', readonly path: string, readonly content: string }
    | { readonly type: 'delete', readonly path: string }

export interface DecisionOption {
  readonly id: string
  readonly label: string
}

/** A question in a plan that a surface must answer before apply. */
export interface Decision {
  readonly id: string
  readonly message: string
  readonly options: readonly DecisionOption[]
  /** The option picked by `--yes`. */
  readonly default: string
}

export interface Plan {
  readonly id: string
  readonly revision: number
  readonly ops: readonly EditOp[]
  readonly changes: readonly FileChange[]
  readonly decisions: readonly Decision[]
  readonly warnings: readonly string[]
  /** Keys whose messages or usages the plan changes. */
  readonly keys: readonly KeyString[]
}

export interface Answers { readonly [decisionId: string]: string }

export interface ApplyResult {
  readonly revision: number
  readonly changes: readonly FileChange[]
}

export interface ProjectChange {
  readonly revision: number
  readonly paths: readonly string[]
  readonly keys: readonly KeyString[]
}

export interface FileScan {
  readonly path: string
  readonly result: ScanResult
}

export interface Project {
  readonly name: string
  readonly config: ResolvedConfig
  /** Resolves when discovery, parse, scan and index are done. */
  readonly ready: Promise<void>
  readonly revision: number
  readonly locales: readonly LocaleCode[]
  readonly sourceLocale: LocaleCode
  readonly resources: readonly Resource[]
  /** True when keys carry a namespace (`ns:key`). */
  readonly namespaced: boolean
  readonly reporters: ReadonlyMap<string, Reporter>
  readonly placeholderSyntaxes: readonly PlaceholderSyntax[]
  /** Extraction templates: config `extract.templates` first, then those of presets. */
  readonly extractTemplates: readonly ExtractTemplate[]
  readonly keys: (query?: KeyQuery) => KeyString[]
  readonly get: (key: KeyString) => KeyInfo | undefined
  readonly message: (key: KeyString, locale: LocaleCode) => Message | undefined
  /** The message a usage of `key` shows: the key's own, or one of its derived keys (`item` → `item_other`). */
  readonly lookup: (key: KeyString, locale: LocaleCode) => Message | undefined
  /** Parses user input such as `common:save` or `save` into a key string. */
  readonly parseKey: (input: string) => KeyString
  readonly usages: (query?: UsageQuery) => UsageMatch[]
  readonly keyAt: (path: string, offset: number) => KeyTarget | undefined
  /** Key and parent nodes of a resource file, in file order. */
  readonly nodes: (path: string) => readonly ResourceNode[]
  /** The nodes of a key (or parent) in every locale, source locale first. */
  readonly locations: (key: KeyString) => readonly ResourceNode[]
  /** Completion positions in a source file. */
  readonly keySlots: (path: string) => readonly TextRange[]
  readonly hardStrings: (path?: string) => readonly (HardString & { readonly path: string })[]
  readonly analyze: () => Analysis
  /** Loads history from the history providers, after `ready`. `watch` reloads it when a provider sees a change. Analysis runs again once it is loaded. */
  readonly loadHistory: (options?: { readonly watch?: boolean | undefined }) => Promise<void>
  /** When a message last changed. Undefined until history is loaded, and for messages without history. */
  readonly history: (key: KeyString, locale: LocaleCode) => MessageChange | undefined
  /** The value a message had at a time (ms), from the provider that knows the message. */
  readonly valueAt: (key: KeyString, locale: LocaleCode, at: number) => MessageLeaf | undefined
  /** Parts of a translate or review prompt for an agent or LLM; render with `renderPrompt`. */
  readonly prompt: (kind: 'translate' | 'review', locale: LocaleCode, options?: PromptOptions) => PromptData
  readonly explain: () => ProjectExplanation
  readonly localeInfo: (code: LocaleCode) => LocaleInfo
  readonly text: (path: string) => string | undefined
  /** True when the path is a resource file or a scanned source file. */
  readonly owns: (path: string) => boolean
  readonly plan: (ops: readonly EditOp[]) => Plan
  readonly apply: (plan: Plan, options?: { readonly answers?: Answers | undefined }) => Promise<ApplyResult>
  /** Re-reads the given files. Hosts with `watch` call this; the LSP calls it for open buffers. */
  readonly update: (events: readonly FileEvent[]) => Promise<ProjectChange | undefined>
  /** Starts watching through the host. */
  readonly watch: () => void
  readonly onChange: (listener: (change: ProjectChange) => void) => () => void
  readonly dispose: () => void
}

import type { CallSpec, ConfigDraft, ExtractTemplate, ResolvedConfig, SerializableConfig } from './config'
import type { Host } from './host'
import type {
  Diagnostic,
  Fix,
  JsonObject,
  KeyString,
  LocaleCode,
  LocaleInfo,
  Location,
  Message,
  MessageLeaf,
  MessageTree,
  NodeRange,
  Placeholder,
  Resource,
  ResourceBlock,
  Severity,
  TextEdit,
  TextRange,
  Usage,
  UsageKind,
} from './model'

export interface ConfigContext {
  readonly host: Host
  /** The user config as written, before presets ran. */
  readonly user: SerializableConfig
}

export interface ManifestReader {
  readonly id: string
  /** File name relative to the project root, for example 'package.json'. */
  readonly file: string
  /** Dependency names listed in the manifest. */
  readonly read: (text: string) => readonly string[]
}

export interface DetectContext {
  readonly host: Host
  readonly dependencies: ReadonlySet<string>
  readonly hasDependency: (name: string) => boolean
  readonly hasAnyDependency: (names: readonly string[]) => boolean
  readonly fileExists: (pattern: string) => Promise<boolean>
}

export interface ResourceCandidate {
  readonly path: string
  readonly locale: LocaleCode
  readonly namespace: string | undefined
  /** Format id hint; otherwise picked by extension. */
  readonly format?: string | undefined
  readonly block?: ResourceBlock | undefined
  readonly readonly?: boolean | undefined
}

export interface FinderContext {
  readonly host: Host
  readonly config: ResolvedConfig
  /** Extensions of every registered format. */
  readonly extensions: readonly string[]
}

export interface LocaleFinder {
  readonly id: string
  readonly override?: boolean | undefined
  readonly find: (ctx: FinderContext) => Promise<readonly ResourceCandidate[]>
  /** Where a new resource for (locale, namespace) should go. Used by edits that create files. */
  readonly resolveNew?: ((target: { readonly locale: LocaleCode, readonly namespace: string | undefined }, ctx: FinderContext) => string | undefined) | undefined
}

export interface FormatContext {
  readonly path: string
  readonly locale: LocaleCode
  readonly namespace: string | undefined
  readonly indent: number | 'tab' | undefined
}

export interface ParseResult {
  readonly tree: MessageTree
  /** Ranges of keys and values (leaves and objects), keyed by `pathId(storedPath)`. */
  readonly ranges?: ReadonlyMap<string, NodeRange> | undefined
}

export type MessageOp
  = | { readonly type: 'set', readonly path: readonly string[], readonly value: MessageLeaf }
    | { readonly type: 'delete', readonly path: readonly string[] }

export interface Format {
  readonly id: string
  /** File extensions without the dot. */
  readonly extensions: readonly string[]
  readonly parse: (text: string, ctx: FormatContext) => ParseResult
  /** Edits text in place. Preferred; keeps comments and layout. Ops run in order. */
  readonly edit?: ((text: string, ops: readonly MessageOp[], ctx: FormatContext) => readonly TextEdit[]) | undefined
  /** Full serialization. Used to create files, and when `edit` is missing. */
  readonly serialize?: ((tree: MessageTree, ctx: FormatContext) => string) | undefined
}

export interface SourceFile {
  readonly path: string
  readonly text: string
  /** Extension without the dot. */
  readonly extension: string
}

export interface ScanContext {
  readonly config: ResolvedConfig
  /** Call specs after `usage.ignoreCallees`. */
  readonly calls: readonly CallSpec[]
}

export interface UsageCandidate {
  readonly raw: string
  readonly range: TextRange
  readonly kind: UsageKind
  readonly dynamic: false | 'prefix' | 'unknown'
  readonly namespace?: string | undefined
  readonly keyPrefix?: string | undefined
  readonly locale?: LocaleCode | undefined
}

/** A region of code with a default namespace or key prefix. */
export interface Scope {
  readonly range: TextRange
  readonly namespace?: string | undefined
  readonly keyPrefix?: string | undefined
}

export interface HardString {
  readonly text: string
  /** Range of the whole literal, quotes included: what a replacement rewrites. */
  readonly range: TextRange
  readonly kind: string
  /** Template arguments: `${name}` becomes `{name}` in the message, the expression is passed to the call. */
  readonly args?: readonly { readonly name: string, readonly expression: string }[] | undefined
  /** Attribute name for attribute kinds. */
  readonly attribute?: string | undefined
}

export interface ScanResult {
  readonly usages: readonly UsageCandidate[]
  readonly scopes?: readonly Scope[] | undefined
  /** Positions where completion of a key makes sense. */
  readonly keySlots?: readonly TextRange[] | undefined
  /** Hard strings found while walking the same AST, for extraction. */
  readonly hardStrings?: readonly HardString[] | undefined
}

export interface Scanner {
  readonly id: string
  /** File extensions without dot. `*` matches every file. */
  readonly extensions: readonly string[]
  readonly runtime?: 'any' | 'node' | undefined
  readonly scan: (file: SourceFile, ctx: ScanContext) => ScanResult | Promise<ScanResult>
}

export interface Extractor {
  readonly id: string
  /** Replacement templates per hard-string kind for this library. */
  readonly templates: readonly ExtractTemplate[]
}

export interface DiagnosticInput {
  readonly message: string
  readonly key?: KeyString | undefined
  readonly locale?: LocaleCode | undefined
  /** Defaults to the message range of `key` in `locale` (or the source locale). */
  readonly location?: Location | undefined
  readonly severity?: Severity | undefined
  readonly fixes?: readonly Fix[] | undefined
}

export interface LocaleCoverage {
  readonly locale: LocaleCode
  readonly total: number
  readonly translated: number
  readonly missing: readonly KeyString[]
  readonly empty: readonly KeyString[]
}

export interface CheckContext {
  readonly config: ResolvedConfig
  readonly sourceLocale: LocaleCode
  readonly locales: readonly LocaleCode[]
  readonly resources: readonly Resource[]
  /** Options from `[severity, options]` in config. */
  readonly options: JsonObject
  /** True when at least one scanner is registered. */
  readonly hasScanners: boolean
  readonly keys: () => readonly KeyString[]
  readonly messages: (locale?: LocaleCode) => Iterable<Message>
  readonly message: (key: KeyString, locale: LocaleCode) => Message | undefined
  /** Every resource message of a key in a locale, more than one when duplicated across files. */
  readonly duplicates: (key: KeyString, locale: LocaleCode) => readonly Message[]
  readonly usages: () => Iterable<Usage>
  readonly coverage: () => readonly LocaleCoverage[]
  readonly unused: () => readonly KeyString[]
  /** Usages whose key is not defined in the source locale. */
  readonly undefinedUsages: () => readonly Usage[]
  readonly placeholders: (value: string) => readonly Placeholder[]
  readonly placeholderSyntaxes: readonly PlaceholderSyntax[]
  /** Errors reported by the `validate` of every placeholder syntax. */
  readonly syntaxErrors: (value: string) => readonly string[]
  readonly localeInfo: (code: LocaleCode) => LocaleInfo
  readonly text: (path: string) => string | undefined
  readonly hardStrings: () => Iterable<HardString & { readonly path: string }>
}

export interface Check {
  readonly id: string
  readonly defaultSeverity: Severity | 'off'
  readonly description?: string | undefined
  readonly docs?: string | undefined
  readonly override?: boolean | undefined
  readonly run: (ctx: CheckContext) => Iterable<DiagnosticInput>
}

export interface ReportSummary {
  readonly errors: number
  readonly warnings: number
  readonly infos: number
  readonly files: number
}

export interface ReportInput {
  readonly project: string
  /** File text, for code frames and line numbers. */
  readonly text: (path: string) => string | undefined
  readonly diagnostics: readonly Diagnostic[]
  readonly coverage: readonly LocaleCoverage[]
  readonly summary: ReportSummary
}

export interface ReporterContext {
  /** Turns a project path into the path to print (relative to the cwd). */
  readonly displayPath: (path: string, project: string) => string
  readonly color: boolean
}

export interface Reporter {
  readonly id: string
  readonly override?: boolean | undefined
  readonly report: (inputs: readonly ReportInput[], ctx: ReporterContext) => string | Promise<string>
}

export interface PlaceholderSyntax {
  readonly id: string
  readonly find: (value: string) => readonly Placeholder[]
  /** Syntax errors in a value, for the `invalid-syntax` check. */
  readonly validate?: ((value: string) => readonly string[]) | undefined
  /** Text used in prompts, for example `{name}`. */
  readonly example?: string | undefined
  /** The placeholder name is another key (vue-i18n `@:key`, i18next `$t(key)`), which then counts as used. */
  readonly reference?: boolean | undefined
  /** Names the library always passes, which a translation may leave out or add (vue-i18n `n` and `count`). */
  readonly implicit?: readonly string[] | undefined
}

export interface KeyContext {
  readonly path: string
}

export interface ResourceTransformContext {
  readonly locale: LocaleCode
  readonly namespace: string | undefined
  readonly path: string
}

/**
 * Changes how a resource's tree maps to keys, for example Rails' top-level locale key
 * or Chrome's `{ "name": { "message": "..." } }`. Edits go to the stored paths.
 */
export interface ResourceTransform {
  /** Whether the transform applies to a resource. Default: every resource. */
  readonly applies?: ((ctx: ResourceTransformContext) => boolean) | undefined
  readonly read: (tree: MessageTree, ctx: ResourceTransformContext) => MessageTree
  /** The path in the file of a key path of the transformed tree. */
  readonly toStored: (path: readonly string[], ctx: ResourceTransformContext) => string[]
}

export interface PromptDraft {
  readonly rules: string[]
  readonly notes: string[]
}

export interface PromptContext {
  readonly sourceLocale: LocaleCode
  readonly targetLocale: LocaleCode
  readonly localeInfo: LocaleInfo
}

export interface Plugin {
  /** Unique, kebab-case. Built-ins use the `x18n:` prefix. */
  readonly name: string
  readonly enforce?: 'pre' | 'post' | undefined
  /** Where the plugin can run. Default 'any'. */
  readonly runtime?: 'any' | 'node' | undefined

  /** Change the config before it is final. Presets use this to set defaults. */
  readonly config?: ((config: ConfigDraft, ctx: ConfigContext) => void | Promise<void>) | undefined
  readonly configResolved?: ((config: ResolvedConfig) => void) | undefined

  readonly manifests?: readonly ManifestReader[] | undefined
  readonly localeFinders?: readonly LocaleFinder[] | undefined
  readonly formats?: readonly Format[] | undefined
  readonly scanners?: readonly Scanner[] | undefined
  readonly extractors?: readonly Extractor[] | undefined
  readonly checks?: readonly Check[] | undefined
  readonly reporters?: readonly Reporter[] | undefined
  readonly placeholders?: readonly PlaceholderSyntax[] | undefined

  /** Turns raw key text into canonical form. The first plugin that returns a value wins. */
  readonly normalizeKey?: ((raw: string, ctx: KeyContext) => string | undefined) | undefined
  readonly derivedKeys?: readonly string[] | undefined
  readonly transformResource?: ResourceTransform | undefined
  readonly translatePrompt?: ((draft: PromptDraft, ctx: PromptContext) => void) | undefined
  /** Display data for a locale code. The first plugin that returns a value wins. */
  readonly localeInfo?: ((code: LocaleCode) => Partial<LocaleInfo> | undefined) | undefined
}

export interface Preset {
  readonly name: string
  /** Decides if the preset applies. Without `detect`, the preset applies only when listed in config. */
  readonly detect?: ((ctx: DetectContext) => boolean | Promise<boolean>) | undefined
  /** When true and detected, presets that come after it are not applied. */
  readonly exclusive?: boolean | undefined
  readonly plugins: readonly (Plugin | Preset)[]
}

/** A preset factory as referenced by name from YAML and JSON configs. */
export type PresetFactory = (options?: JsonObject) => Preset

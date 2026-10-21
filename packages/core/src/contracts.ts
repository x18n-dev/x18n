import type { ErrorInfo } from './errors'
import type { Diagnostic, Fix, KeyString, LocaleCode, Severity } from './types/model'
import { createLineIndex } from './text'

/** Version of every JSON contract (CLI `--json`, LSP `x18n/*`, RPC, MCP). Bumped on breaking changes to any shape. */
export const contractVersion = 2

export interface WireRange {
  /** 1-based. */
  readonly line: number
  /** 1-based, UTF-16 code units. */
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  /** 0-based UTF-16 offsets. */
  readonly start: number
  readonly end: number
}

export interface WireDiagnostic {
  readonly project: string
  readonly code: string
  readonly severity: Severity
  readonly message: string
  readonly key: KeyString | undefined
  readonly locale: LocaleCode | undefined
  /** Path relative to the project root. */
  readonly file: string | undefined
  readonly range: WireRange | undefined
  readonly fixes: readonly Fix[]
}

export interface Envelope<T> {
  readonly x18n: number
  readonly command: string
  readonly data: T
  readonly diagnostics: readonly WireDiagnostic[]
  readonly errors: readonly ErrorInfo[]
}

/** Line and column form of an offset range in a text. */
export function toWireRange(text: string | undefined, start: number, end: number): WireRange {
  const index = createLineIndex(text ?? '')
  const from = index.position(start)
  const to = index.position(end)
  return { line: from.line + 1, column: from.character + 1, endLine: to.line + 1, endColumn: to.character + 1, start, end }
}

export function toWireDiagnostic(project: string, diagnostic: Diagnostic, text: (path: string) => string | undefined): WireDiagnostic {
  const location = diagnostic.location
  return {
    project,
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    key: diagnostic.key,
    locale: diagnostic.locale,
    file: location?.path,
    range: location ? toWireRange(text(location.path), location.range.start, location.range.end) : undefined,
    fixes: diagnostic.fixes,
  }
}

export function envelope<T>(command: string, data: T, diagnostics: readonly WireDiagnostic[] = [], errors: readonly ErrorInfo[] = []): Envelope<T> {
  return { x18n: contractVersion, command, data, diagnostics, errors }
}

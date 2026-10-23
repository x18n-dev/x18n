import type { MessageLeaf, PlaceholderProblem } from '@x18n/core'
import type { ApplyView, UiEditOp } from '../src/node/types'
import { t } from './i18n'
import { backend, projectName } from './state'

/** Writes through the server's plan and apply; placeholder problems come back unwritten unless `force`. */
export function applyEdit(ops: readonly UiEditOp[], force = false): Promise<ApplyView> {
  return backend.value!.apply({ project: projectName.value, ops, force })
}

export function setMessage(key: string, locale: string, value: MessageLeaf, force = false): Promise<ApplyView> {
  return applyEdit([
    { type: 'set', key, locale, value },
  ], force)
}

export function describeProblem(problem: PlaceholderProblem): string {
  return [
    problem.missing.length
      ? t('edit.placeholdersMissing', {
          names: problem.missing.join(', '),
        })
      : '',
    problem.extra.length
      ? t('edit.placeholdersExtra', {
          names: problem.extra.join(', '),
        })
      : '',
  ].filter(Boolean).join('; ')
}

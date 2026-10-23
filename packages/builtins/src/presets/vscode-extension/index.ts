import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { braces } from '../../placeholders'
import { nlsFinder } from './nls'

export function vscodeExtension(): Preset {
  return {
    name: 'vscode-extension',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:vscode-extension',
        calls: [
          {
            callee: ['l10n.t', 'vscode.l10n.t'],
          },
        ],
        finders: [nlsFinder],
        extra: (draft) => {
          draft.usage = {
            ...draft.usage,
            regex: [
              ...draft.usage.regex,
              {
                extensions: ['json'],
                patterns: ['"%({key})%"'],
              },
            ],
          }
        },
        placeholders: [braces],
      }),
    ],
  }
}

export default vscodeExtension

import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { regexScopes } from '../../scanners/regex-scopes'
import { i18nextPlugin } from '../i18next/plugin'
import { scriptExtensions } from '../shared'

export function reactI18next(): Preset {
  return {
    name: 'react-i18next',
    plugins: [
      i18nextPlugin,
      createLibraryPlugin({
        name: 'x18n:react-i18next',
        calls: [
          {
            callee: 'useTranslation',
            factory: true,
            returns: ['t'],
            namespace: { arg: 0 },
            keyPrefix: { arg: 1, property: 'keyPrefix' },
          },
          {
            callee: 'Trans',
            key: { arg: 0, property: 'i18nKey' },
            namespace: { arg: 0, property: 'ns' },
          },
          {
            callee: 'Translation',
            factory: true,
            returns: ['t'],
            namespace: { arg: 0, property: 'ns' },
            keyPrefix: { arg: 0, property: 'keyPrefix' },
          },
        ],
        templates: [
          {
            template: '<Trans i18nKey="{key}" />',
            kinds: ['jsx-text'],
            imports: ['import { Trans } from \'react-i18next\''],
          },
          {
            template: '{attr}={i18next.t(\'{key}\'{args})}',
            kinds: ['jsx-attribute'],
            imports: ['import i18next from \'i18next\''],
          },
        ],
      }),
      // `withTranslation('ns', { keyPrefix })(Component)` passes `t` through props, usually below the component.
      regexScopes('\\bwithTranslation\\(\\s*(?:\\[?\\s*[\'"`](?<namespace>[^\'"`]+)[\'"`])?(?:[^)]*?\\bkeyPrefix\\s*:\\s*[\'"`](?<keyPrefix>[^\'"`]+)[\'"`])?', 'react-i18next-hoc', { wholeFile: true, extensions: scriptExtensions }),
    ],
  }
}

export default reactI18next

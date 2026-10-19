// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/ngx-translate.ts and transloco.ts
import type { Preset } from '@x18n/core'
import { doubleBraces, placeholders } from '../placeholders'
import { regexScopes } from '../scanners/regex'
import { dependsOn, library } from './shared'

const templates = ['html', 'ts', 'js']

export function ngxTranslate(): Preset {
  return {
    name: 'ngx-translate',
    detect: dependsOn(['@ngx-translate/core']),
    plugins: [
      library({
        name: 'ngx-translate',
        calls: [{ callee: ['translate.instant', 'translate.get', 'translate.stream', 'translateService.instant', 'translateService.get', 'translateService.stream', '_'] }],
        regex: [{
          extensions: templates,
          patterns: [
            '[`\'"]({key})[`\'"][\\s\\n]*\\|[\\s\\n]*translate\\b',
            '[\\s\\n]translate>[\\s\\n]*({key})[\\s\\n]*</',
            '\\[translate\\]=["\']\'({key})\'["\']',
            '\\stranslate=["\']({key})["\']',
          ],
        }],
        resources: [{ pattern: 'src/assets/i18n/{locale}.json' }, { pattern: 'src/assets/i18n/{locale}/{namespaces}.json' }],
        templates: [
          { template: '{{ \'{key}\' | translate }}', kinds: ['html-text'] },
          { template: 'this.translate.instant(\'{key}\'{args})', kinds: ['js-string', 'js-template'] },
        ],
      }),
      placeholders(doubleBraces),
    ],
  }
}

export function transloco(): Preset {
  return {
    name: 'transloco',
    detect: dependsOn(['@jsverse/transloco', '@ngneat/transloco']),
    plugins: [
      library({
        name: 'transloco',
        // The scope folder `todos-page` is the key prefix `todosPage.`.
        namespace: { fromPath: 'camel' },
        calls: [{ callee: ['translate', 'translocoService.translate', 'transloco.translate', 'translocoService.selectTranslate', 'transloco.selectTranslate'] }],
        regex: [{
          extensions: templates,
          patterns: [
            '[`\'"]({key})[`\'"][\\s\\n]*\\|[\\s\\n]*transloco\\b',
            '[^\\w\\d]t\\([\\s\\n]*[\'"`]({key})[\'"`]',
            '[^*\\w\\d]transloco=[\'"`]({key})[\'"`]',
          ],
        }],
        resources: [{ pattern: 'src/assets/i18n/{locale}.json' }, { pattern: 'src/assets/i18n/{namespaces}/{locale}.json' }],
        templates: [
          { template: '{{ \'{key}\' | transloco }}', kinds: ['html-text'] },
          { template: 'translate(\'{key}\'{args})', kinds: ['js-string', 'js-template'], imports: ['import { translate } from \'@jsverse/transloco\''] },
        ],
      }),
      // `*transloco="let t; read: 'scope'"` prefixes the keys of the element.
      regexScopes('\\*transloco="[^"]*read:\\s*\'([^\']+)\'', 'transloco-read', { as: 'keyPrefix', extensions: ['html'] }),
      placeholders(doubleBraces),
    ],
  }
}

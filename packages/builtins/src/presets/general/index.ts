import type { Preset } from '@x18n/core'
// Detection and syntax adapted from i18n-ally (MIT), src/frameworks/*
import { defaultTemplates } from '../../extractors'

/** Always last: hard-string extraction templates for plain JS, TS and HTML. */
export function general(): Preset {
  return {
    name: 'general',
    plugins: [
      {
        name: 'x18n:general',
        extractors: [
          { id: 'general', templates: defaultTemplates },
        ],
      },
    ],
  }
}

export default general

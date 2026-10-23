import type { Preset } from '@x18n/core'
import { createLibraryPlugin } from '@x18n/core'
import { fluent } from '../../placeholders'

export function fluentReact(): Preset {
  return {
    name: 'fluent-react',
    plugins: [
      createLibraryPlugin({
        name: 'x18n:fluent-react',
        calls: [
          {
            callee: 'Localized',
            key: { arg: 0, property: 'id' },
          },
          // `useLocalization()` gives `{ l10n }`, `withLocalization` gives a `getString` prop. A bare
          // `getString` is left out: a destructured prop can't be told apart from unrelated functions.
          {
            callee: ['l10n.getString', 'props.getString', 'this.props.getString'],
          },
        ],
        // `<Localized attrs={{ title: true }}>` reads the message's attributes, the keys `{key}.title`.
        derivedKeys: ['{key}.*'],
        resources: [
          { pattern: 'public/locales/{locale}/*.ftl' },
          { pattern: 'locales/{locale}.ftl' },
          { pattern: 'src/locales/{locale}.ftl' },
        ],
        templates: [
          {
            template: '<Localized id="{key}" />',
            kinds: ['jsx-text'],
            imports: ['import { Localized } from \'@fluent/react\''],
          },
          {
            template: '{attr}={l10n.getString(\'{key}\'{args})}',
            kinds: ['jsx-attribute'],
          },
          {
            template: 'l10n.getString(\'{key}\'{args})',
            kinds: ['js-string', 'js-template'],
          },
        ],
        placeholders: [fluent],
      }),
    ],
  }
}

export default fluentReact

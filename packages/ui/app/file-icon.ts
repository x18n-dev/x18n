// @unocss-include: the icon classes below live in a .ts file, which UnoCSS does not scan by default.
// Adapted from @antfu/design (MIT), `utils/icon.ts`: trimmed to resource and source files.

interface FileIconRule {
  readonly match: RegExp
  readonly name: string
  readonly icon: string
}

const rules: readonly FileIconRule[] = [
  { match: /\.vue$/, name: 'vue', icon: 'i-catppuccin:vue' },
  { match: /\.svelte$/, name: 'svelte', icon: 'i-catppuccin:svelte' },
  { match: /\.astro$/, name: 'astro', icon: 'i-catppuccin:astro' },
  { match: /\.tsx$/, name: 'tsx', icon: 'i-catppuccin:typescript-react' },
  { match: /\.jsx$/, name: 'jsx', icon: 'i-catppuccin:javascript-react' },
  { match: /\.d\.[cm]?ts$/, name: 'dts', icon: 'i-catppuccin:typescript-def' },
  { match: /\.(?:test|spec)\.[cm]?[jt]sx?$/, name: 'test', icon: 'i-catppuccin:typescript-test' },
  { match: /\.[cm]?ts$/, name: 'ts', icon: 'i-catppuccin:typescript' },
  { match: /\.[cm]?js$/, name: 'js', icon: 'i-catppuccin:javascript' },
  { match: /\.json[5c]?$/, name: 'json', icon: 'i-catppuccin:json' },
  { match: /\.ya?ml$/, name: 'yaml', icon: 'i-catppuccin:yaml' },
  { match: /\.toml$/, name: 'toml', icon: 'i-catppuccin:toml' },
  { match: /\.md$/, name: 'markdown', icon: 'i-catppuccin:markdown' },
  { match: /\.html?$/, name: 'html', icon: 'i-catppuccin:html' },
  { match: /\.php$/, name: 'php', icon: 'i-catppuccin:php' },
  { match: /\.rb$/, name: 'ruby', icon: 'i-catppuccin:ruby' },
  { match: /\.(?:xml|xliff|xlf)$/, name: 'xml', icon: 'i-catppuccin:xml' },
  { match: /\.properties$/, name: 'properties', icon: 'i-catppuccin:properties' },
  { match: /\.(?:po|pot|strings|arb|txt)$/, name: 'text', icon: 'i-catppuccin:text' },
]

/** `{ name, icon }` of the first rule that matches the path, or the generic file. */
export function getFileType(path: string): { name: string, icon: string } {
  return rules.find(rule => rule.match.test(path)) ?? { name: 'file', icon: 'i-catppuccin:file' }
}

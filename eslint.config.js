// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    vue: true,
    antislop: true,
    ignores: [
      '**/.nuxt',
      '**/.output',
      '**/.data',
      'packages/vscode/src/generated',
      '**/.vscode-test',
      'packages/core/schema',
      // Sample user projects for tests.
      'test/fixtures',
      'playground',
    ],
  },
  {
    rules: {
      // Parsers, scanners and the edit planner walk trees; 25 keeps them readable without splitting every visitor.
      'sonarjs/cognitive-complexity': ['error', 25],
    },
  },
  // Layer rules (plans/01-architecture.md): core runs anywhere and names no library or format;
  // builtins use only the public core API and no Node APIs.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['node:*', 'vscode', 'vscode-*', 'devframe', 'devframe/*', '@x18n/*'], message: 'Core runs in any JS runtime and depends on no surface.' },
      ] }],
    },
  },
  {
    files: ['packages/builtins/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['node:*', 'vscode', 'devframe', '@x18n/node', '@x18n/cli', '@x18n/lsp', '@x18n/ui', '@x18n/core/*'], message: 'Built-ins use only the public API of @x18n/core and no Node APIs.' },
      ] }],
    },
  },
)

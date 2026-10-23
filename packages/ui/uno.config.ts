import { defineConfig, presetIcons, presetWind4 } from 'unocss'

/** Black and white, square corners, 1px guide lines; status colors are the only hues. */
const tokens = `
:root {
  --x-bg: #fff;
  --x-fg: #0a0a0a;
  --x-muted: #0a0a0a9e;
  --x-faint: #0a0a0a59;
  --x-line: #0a0a0a1f;
  --x-line-strong: #0a0a0a66;
  --x-hover: #0a0a0a0a;
  --x-error: #dc2626;
  --x-warn: #b45309;
  --x-ok: #15803d;
  --x-info: #0369a1;
  color-scheme: light;
}
html.dark {
  --x-bg: #0a0a0a;
  --x-fg: #fafafa;
  --x-muted: #fafafa9e;
  --x-faint: #fafafa59;
  --x-line: #fafafa24;
  --x-line-strong: #fafafa66;
  --x-hover: #fafafa0f;
  --x-error: #f87171;
  --x-warn: #fbbf24;
  --x-ok: #4ade80;
  --x-info: #7dd3fc;
  color-scheme: dark;
}
/* VS Code high contrast themes: black surface, solid lines. */
html.high-contrast {
  --x-bg: #000;
  --x-fg: #fff;
  --x-muted: #fffd;
  --x-faint: #fffa;
  --x-line: #fffa;
  --x-line-strong: #fff;
}
html, body, #__nuxt {
  height: 100%;
  margin: 0;
  background: var(--x-bg);
  color: var(--x-fg);
}
body {
  -webkit-font-smoothing: antialiased;
}
::selection {
  background: var(--x-fg);
  color: var(--x-bg);
}
`

/** Every color is one of the tokens above, so light, dark and high contrast stay in step. */
export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({ scale: 1.1 }),
  ],
  preflights: [
    {
      getCSS: () => tokens,
    },
  ],
  shortcuts: {
    'bg-base': 'bg-[var(--x-bg)]',
    'bg-inverse': 'bg-[var(--x-fg)]',
    'bg-hover': 'bg-[var(--x-hover)]',
    'color-base': 'text-[var(--x-fg)]',
    'color-inverse': 'text-[var(--x-bg)]',
    'color-muted': 'text-[var(--x-muted)]',
    'color-faint': 'text-[var(--x-faint)]',
    'color-error': 'text-[var(--x-error)]',
    'color-warn': 'text-[var(--x-warn)]',
    'color-ok': 'text-[var(--x-ok)]',
    'color-info': 'text-[var(--x-info)]',
    'border-base': 'border-[var(--x-line)]',
    'border-strong': 'border-[var(--x-line-strong)]',
    'border-inverse': 'border-[var(--x-fg)]',
    'label': 'font-mono text-[11px] leading-[1.45] uppercase tracking-[0.12em] color-muted',
    'focus-ring': 'focus-visible:outline-2 focus-visible:outline-[var(--x-fg)] focus-visible:outline-offset-2',
    'input': 'rounded-none border border-base bg-transparent px-2 h-8 text-sm color-base outline-none transition-colors placeholder:color-faint focus:border-inverse',
    'btn': 'inline-flex h-8 items-center justify-center gap-1.5 border px-3 text-xs font-medium transition-colors duration-150 select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 focus-ring',
    'btn-solid': 'btn border-inverse bg-inverse color-inverse hover:opacity-85',
    'btn-outline': 'btn border-strong color-base hover:border-inverse hover:bg-inverse hover:color-inverse',
    'btn-ghost': 'btn border-transparent color-muted hover:color-base hover:bg-hover',
    'btn-icon': 'btn-ghost w-8 px-0',
    'badge': 'inline-flex items-center border border-base px-1 font-mono text-[10px] leading-4 uppercase tracking-[0.08em] color-muted whitespace-nowrap',
    // Catppuccin's icons are tuned for dark surfaces: recolor them on light ones.
    'icon-catppuccin': 'invert-100 hue-rotate-180 brightness-80 dark:invert-0 dark:hue-rotate-0 dark:brightness-100',
  },
})

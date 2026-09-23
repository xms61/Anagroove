/** @type {import('tailwindcss').Config} */
const token = name => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Theme tokens (src/themes.css). Components use only these colour names.
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        panel: token('panel'),
        glass: 'rgb(var(--c-panel) / var(--panel-alpha))',
        raised: token('raised'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'on-accent': token('on-accent'),
        hi: token('hi'),
        'on-hi': token('on-hi'),
        ok: token('ok'),
        bad: token('bad'),
        cell: token('cell'),
        'cell-fg': token('cell-fg'),
        'cell-num': token('cell-num'),
        word: token('word'),
        cursor: token('cursor'),
        'cursor-fg': token('cursor-fg'),
        'ok-cell': token('ok-cell'),
        'bad-cell': token('bad-cell'),
        line: 'var(--line)',
        'cell-line': 'var(--cell-line)',
        'word-line': 'var(--word-line)',
      },
      borderRadius: {
        panel: 'var(--radius-panel)',
        control: 'var(--radius-control)',
        cell: 'var(--radius-cell)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        accent: 'var(--shadow-accent)',
        cursor: 'var(--shadow-cursor)',
      },
    },
  },
  plugins: [],
}

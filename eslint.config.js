import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/data/**',
      'data/**',
      'server/data/**',
      '*.zip',
      '.system_generated/**',
      'scratch/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      'no-console': ['warn', { allow: ['log', 'warn', 'error', 'info'] }]
    }
  },
  {
    files: ['server/**/*.{js,ts}', 'scripts/**/*.{js,ts}', 'shared/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        RequestInit: 'readonly',
        Response: 'readonly',
        URLSearchParams: 'readonly',
        performance: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    // Theme tokens (src/themes.css) are the only palette: no raw Tailwind colours or hex in components
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/(^|[ :])(bg|text|border|ring|from|to|via|shadow|fill|stroke|outline|accent|divide|placeholder)-((slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(white|black)([^a-zA-Z-]|$))/]',
          message: 'Use a theme token (bg-panel, text-muted, border-line, bg-accent, …) instead of a raw Tailwind colour.',
        },
        {
          selector: 'TemplateElement[value.raw=/(^|[ :])(bg|text|border|ring|from|to|via|shadow|fill|stroke|outline|accent|divide|placeholder)-((slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(white|black)([^a-zA-Z-]|$))/]',
          message: 'Use a theme token (bg-panel, text-muted, border-line, bg-accent, …) instead of a raw Tailwind colour.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/]',
          message: 'Use a theme token or rgb(var(--c-…)) instead of a hex colour.',
        },
      ],
    },
  },
  {
    // Runs in the browser before the app (index.html)
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { document: 'readonly', localStorage: 'readonly' },
    },
  },
  {
    // Crawlers and long-running scripts legitimately use while(true) event loops
    files: ['server/crawler/**/*.{js,ts}', 'scripts/**/*.{js,ts}'],
    rules: {
      'no-constant-condition': ['warn', { checkLoops: false }]
    }
  }
];

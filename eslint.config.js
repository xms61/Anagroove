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
    files: ['server/**/*.js', 'scripts/**/*.js', 'shared/**/*.js'],
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
    // Crawlers and long-running scripts legitimately use while(true) event loops
    files: ['server/crawler/**/*.js', 'scripts/**/*.js'],
    rules: {
      'no-constant-condition': ['warn', { checkLoops: false }]
    }
  }
];

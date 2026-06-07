import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default [
  {
    ignores: [
      'dist',
      'dist-ssr',
      'node_modules',
      'backend/**',
      'superadmin/**',
      'temp_*.jsx',
      'temp_*.js',
      'tmp_*.mjs',
      'tmp_*.js',
      'check_*.mjs',
      'apply_*.mjs',
      'migrate_*.mjs',
      'verify_*.mjs',
      'test_*.mjs',
      'new_kds.html'
    ]
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
]

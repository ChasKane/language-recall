import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import obsidianmd from 'eslint-plugin-obsidianmd';

// Obsidian recommended rule severities (plugin's recommended config uses "extends", incompatible with flat config)
const obsidianmdRecommendedRules = {
  'obsidianmd/commands/no-command-in-command-id': 'error',
  'obsidianmd/commands/no-command-in-command-name': 'error',
  'obsidianmd/commands/no-default-hotkeys': 'error',
  'obsidianmd/commands/no-plugin-id-in-command-id': 'error',
  'obsidianmd/commands/no-plugin-name-in-command-name': 'error',
  'obsidianmd/settings-tab/no-manual-html-headings': 'error',
  'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
  'obsidianmd/vault/iterate': 'error',
  'obsidianmd/detach-leaves': 'error',
  'obsidianmd/hardcoded-config-path': 'error',
  'obsidianmd/no-forbidden-elements': 'error',
  'obsidianmd/no-plugin-as-component': 'error',
  'obsidianmd/no-sample-code': 'error',
  'obsidianmd/no-tfile-tfolder-cast': 'error',
  'obsidianmd/no-view-references-in-plugin': 'error',
  'obsidianmd/no-static-styles-assignment': 'error',
  'obsidianmd/object-assign': 'error',
  'obsidianmd/platform': 'error',
  'obsidianmd/prefer-file-manager-trash-file': 'warn',
  'obsidianmd/prefer-abstract-input-suggest': 'error',
  'obsidianmd/regex-lookbehind': 'error',
  'obsidianmd/sample-names': 'error',
  'obsidianmd/validate-manifest': 'error',
  'obsidianmd/validate-license': 'error',
  'obsidianmd/ui/sentence-case': ['error', { enforceCamelCaseLower: true }],
};

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'dist/**',
      '**/*.test.ts',
      'vitest.config.ts',
      'src/obsidian.ts',
      'src/mocks.ts',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      obsidianmd,
    },
    rules: {
      // TypeScript/ESLint parity with previous .eslintrc
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-floating-promises': 'error',

      // TypeScript handles undefined vars better than ESLint here
      'no-undef': 'off',

      // Only allow console.warn, console.error, console.debug
      'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],

      // Formatting
      'prettier/prettier': 'error',

      // Obsidian plugin recommended rules (flat-config compatible)
      ...obsidianmdRecommendedRules,
    },
  },
];


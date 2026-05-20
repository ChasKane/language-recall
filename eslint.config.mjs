import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'dist/**',
      'main.js',
      'styles.css',
      '**/*.test.ts',
      'vitest.config.ts',
      'src/obsidian.ts',
      'src/mocks.ts',
      '*.mjs',
      'version-bump.mjs',
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.{json,js,mjs,cjs,jsx}'],
    rules: {
      'obsidianmd/no-plugin-as-component': 'off',
      'obsidianmd/no-view-references-in-plugin': 'off',
      'obsidianmd/no-unsupported-api': 'off',
      'obsidianmd/prefer-instanceof': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      'prettier/prettier': 'error',
    },
  },
];

import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    coverage: {
      reporter: ['text', 'json-summary', 'json'],
      provider: 'istanbul',
    },
  },
  resolve: {
    alias: [
      { find: '@app', replacement: resolve(__dirname, './src') },
      { find: 'src', replacement: resolve(__dirname, './src') },
      // Use a lightweight stub so tests don't depend on Obsidian internals.
      { find: 'obsidian', replacement: resolve(__dirname, './src/obsidian.ts') },
    ],
  },
});

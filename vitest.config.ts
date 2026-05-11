import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.scale/**',
      '**/src/renderer/layout/*.test.tsx',
      '**/src/renderer/settings/*.test.tsx',
      '**/src/renderer/stores/theme-store.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['**/src/**/*.{ts,tsx}'],
      exclude: ['**/src/**/*.{test,spec}.{ts,tsx}', '**/src/**/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared/parser': path.join(__dirname, 'packages/shared/src/parser'),
      '@shared/types': path.join(__dirname, 'packages/shared/src/types'),
    },
  },
});

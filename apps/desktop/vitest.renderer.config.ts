import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/renderer/test/setup.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
      '@shared/parser': path.join(__dirname, '../../packages/shared/src/parser'),
      '@shared/types': path.join(__dirname, '../../packages/shared/src/types'),
    },
  },
});

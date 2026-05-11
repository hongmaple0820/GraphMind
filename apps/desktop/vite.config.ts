import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

const sharedAlias = {
  '@shared/parser': path.join(__dirname, '../../packages/shared/src/parser'),
  '@shared/types': path.join(__dirname, '../../packages/shared/src/types'),
};

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: path.join(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['electron', 'electron-store', 'webdav', 'vectra', 'onnxruntime-node'],
            },
          },
          resolve: {
            alias: sharedAlias,
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'src/main/preload.ts'),
        vite: {
          build: {
            outDir: path.join(__dirname, 'dist/preload'),
          },
          resolve: {
            alias: sharedAlias,
          },
        },
      },
    }),
  ],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
            '@codemirror/search',
          ],
          'vendor-codemirror-langs': ['@codemirror/lang-markdown', '@codemirror/language-data'],
          'vendor-cytoscape': ['cytoscape', 'cytoscape-dagre'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
      ...sharedAlias,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['.monkeycode-ai.online'],
  },
});

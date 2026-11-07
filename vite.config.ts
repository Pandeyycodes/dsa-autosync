/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = __dirname;

/**
 * Main build: extension pages (popup, dashboard) + background service worker.
 * Content scripts are built separately as self-contained IIFE bundles by
 * scripts/build-content.mjs, because Chrome cannot load them as ES modules.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'popup.html'),
        dashboard: resolve(root, 'dashboard.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        // Keep React/UI libraries out of the service worker's import graph.
        manualChunks: (id) =>
          id.includes('node_modules') ? (/[\\/]node_modules[\\/]zod[\\/]/.test(id) ? 'zod' : 'vendor-ui') : undefined,
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

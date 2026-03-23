import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Transforms any `?url` import into a stub string.
 * In production Vite resolves these to hashed asset URLs;
 * in tests we just need a non-empty string to prevent load errors.
 */
const assetUrlStub: Plugin = {
  name: 'asset-url-stub',
  resolveId(id) {
    if (id.includes('?url')) return id;
  },
  load(id) {
    if (id.includes('?url')) return `export default "/mock/${id.split('/').pop()?.replace('?url', '')}";`;
  },
};

export default defineConfig({
  plugins: [assetUrlStub],
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/assets/**'],
    },
  },
});

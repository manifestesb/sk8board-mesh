import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@manifeste/sk8board': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const original = assetInfo.originalFileNames?.[0] ?? '';
          const match = original.match(/src\/assets\/(.+)/);
          if (match) return `assets/${match[1]}`;
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(__dirname, '../src/assets'),
          dest: '.',
        },
      ],
    }),
  ],
});

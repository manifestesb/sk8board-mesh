import { defineConfig } from 'vite';
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
      // Permite servir assets da lib (../src/assets/) durante o dev
      allow: ['..'],
    },
  },
});

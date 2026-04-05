import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    port: 4174,
    proxy: {
      '/api': {
        target: process.env.VITE_ADMIN_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});

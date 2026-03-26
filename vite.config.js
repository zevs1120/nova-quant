import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest 4+ bundles Vite 8 (oxc/rolldown); @vitejs/plugin-react 4.x still registers legacy
// esbuild hooks and prints deprecation noise. Tests only import TS/JS (no JSX), so omit
// the React plugin during `vitest` — keeps `vite build` / dev unchanged.
const vitestRunning = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: vitestRunning ? [] : [react()],
  test: {
    exclude: ['**/node_modules/**', 'artifacts/**', 'dist/**', 'build/**', 'coverage/**'],
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // React runtime rarely changes between deploys; keeping it in a
          // dedicated chunk lets browsers long-term-cache it across releases.
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});

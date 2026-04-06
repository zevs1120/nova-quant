import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const publicSupabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const publicSupabaseRedirectUrl =
  process.env.VITE_SUPABASE_AUTH_REDIRECT_URL ||
  process.env.SUPABASE_AUTH_REDIRECT_URL ||
  process.env.NOVA_APP_URL ||
  '';
const publicApiBase = process.env.VITE_API_BASE_URL || process.env.VITE_PUBLIC_API_BASE_URL || '';

export default defineConfig({
  // React plugin required for Vitest when importing JSX (e.g. admin components, hook suites).
  plugins: [react()],
  define: {
    'globalThis.__NOVA_PUBLIC_SUPABASE_URL__': JSON.stringify(publicSupabaseUrl),
    'globalThis.__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__': JSON.stringify(publicSupabaseKey),
    'globalThis.__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__': JSON.stringify(publicSupabaseRedirectUrl),
    'globalThis.__NOVA_PUBLIC_API_BASE_URL__': JSON.stringify(publicApiBase),
  },
  resolve: {
    alias: {
      // Ensure consistent React version across all tests (including landing components)
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    exclude: [
      '**/node_modules/**',
      'artifacts/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'tests/e2e/**',
      'tests/pro-env/**',
    ],
    setupFiles: ['tests/vitest.setup.ts'],
    // Default Vitest parallelism (file + worker pool) — serial mode was ~5× slower on 138 files.
    env: {
      DOTENV_CONFIG_QUIET: 'true',
    },
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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
          }
        },
      },
    },
  },
});

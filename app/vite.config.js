import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');
const publicSupabaseUrl =
  process.env.VITE_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const publicSupabaseKey =
  process.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const publicSupabaseRedirectUrl =
  process.env.VITE_PUBLIC_SUPABASE_AUTH_REDIRECT_URL ||
  process.env.VITE_SUPABASE_AUTH_REDIRECT_URL ||
  process.env.NOVA_PUBLIC_APP_URL ||
  process.env.SUPABASE_AUTH_REDIRECT_URL ||
  process.env.NOVA_APP_URL ||
  '';
const publicApiBase =
  process.env.VITE_PUBLIC_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  process.env.NOVA_PUBLIC_API_URL ||
  '';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  define: {
    'globalThis.__NOVA_PUBLIC_SUPABASE_URL__': JSON.stringify(publicSupabaseUrl),
    'globalThis.__NOVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY__': JSON.stringify(publicSupabaseKey),
    'globalThis.__NOVA_PUBLIC_SUPABASE_REDIRECT_URL__': JSON.stringify(publicSupabaseRedirectUrl),
    'globalThis.__NOVA_PUBLIC_API_BASE_URL__': JSON.stringify(publicApiBase),
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

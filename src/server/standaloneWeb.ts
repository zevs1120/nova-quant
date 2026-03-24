import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { logInfo, logWarn } from './utils/log.js';

const serverFile = fileURLToPath(import.meta.url);
const serverDir = path.dirname(serverFile);
const repoRoot = path.resolve(serverDir, '../..');

function shouldServeWebDist(env = process.env) {
  const raw = String(env.SERVE_WEB_DIST || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
}

function resolveWebDistPath(env = process.env) {
  const explicit = String(env.WEB_DIST_PATH || '').trim();
  return explicit ? path.resolve(explicit) : path.join(repoRoot, 'dist');
}

export function attachStandaloneWebShell(app: Express, env = process.env) {
  if (!shouldServeWebDist(env)) return app;

  const distDir = resolveWebDistPath(env);
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    logWarn('SERVE_WEB_DIST was enabled but dist/index.html is missing', { distDir });
    return app;
  }

  app.use(express.static(distDir));
  app.get(/^\/(?!api(?:\/|$)|healthz$).*/, (_req, res) => {
    res.sendFile(indexPath);
  });
  logInfo('Standalone web shell enabled', { distDir });
  return app;
}

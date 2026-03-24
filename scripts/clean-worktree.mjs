#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGETS = [
  'dist',
  'build',
  'coverage',
  'node_modules',
  'artifacts',
  'release',
  '.vercel',
  path.join('data', 'quant.db'),
  path.join('data', 'quant.db-wal'),
  path.join('data', 'quant.db-shm'),
];

function removeByName(root, targetName) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.name === targetName) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) removeByName(fullPath, targetName);
  }
}

for (const relativePath of TARGETS) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  fs.rmSync(fullPath, { recursive: true, force: true });
}

removeByName(ROOT, '.DS_Store');
removeByName(ROOT, '__MACOSX');

process.stdout.write('clean-worktree-complete\n');

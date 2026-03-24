#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts');
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

const EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'artifacts',
  'release',
  '.vercel',
  '__MACOSX',
  '*.log',
  '*.tmp',
  '.DS_Store',
  'data/*.db',
  'data/*.db-*',
  'data/*.sqlite',
  'data/*.sqlite-*',
  '*.wal',
  '*.shm',
];

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    output: `nova-quant-source-${STAMP}.tar.gz`,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      parsed.output = String(argv[i + 1]).trim() || parsed.output;
      i += 1;
    }
  }

  return parsed;
}

function buildTarArgs(outputPath) {
  return ['-czf', outputPath, ...EXCLUDES.flatMap((pattern) => ['--exclude', pattern]), '.'];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUT_DIR, args.output);
  const payload = {
    mode: args.dryRun ? 'dry-run' : 'package',
    output: outputPath,
    excludes: EXCLUDES,
  };

  if (args.dryRun) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  execFileSync('tar', buildTarArgs(outputPath), {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
}

main();

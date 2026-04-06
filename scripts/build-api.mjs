#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const markerFile = path.join(distDir, 'api-only.txt');
const indexFile = path.join(distDir, 'index.html');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

execFileSync(
  process.execPath,
  ['--import', 'tsx', '--eval', "import './api/index.ts'; console.log('API validated')"],
  {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  },
);

fs.writeFileSync(
  markerFile,
  ['novaquant-api build artifact', `built_at=${new Date().toISOString()}`, 'surface=api-only'].join(
    '\n',
  ) + '\n',
);

fs.writeFileSync(
  indexFile,
  [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>novaquant-api</title></head>',
    '<body><pre>novaquant-api deployment surface is api-only.</pre></body></html>',
  ].join(''),
);

process.stdout.write(`API build output ready at ${path.relative(root, distDir) || 'dist'}\n`);

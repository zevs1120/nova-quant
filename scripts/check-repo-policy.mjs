#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_IGNORE_PATTERNS = [
  'node_modules/',
  'dist/',
  'coverage/',
  'data/*.db',
  '__MACOSX/',
  '.DS_Store',
  '.vercel',
];
const REQUIRED_SCRIPTS = ['typecheck', 'build', 'test', 'verify', 'clean', 'package:source'];

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const gitignore = readText('.gitignore');
for (const pattern of REQUIRED_IGNORE_PATTERNS) {
  if (!gitignore.includes(pattern)) {
    fail(`Missing .gitignore pattern: ${pattern}`);
  }
}

if (fs.existsSync(path.join(ROOT, 'package.json'))) {
  const pkg = JSON.parse(readText('package.json'));
  for (const scriptName of REQUIRED_SCRIPTS) {
    if (!pkg.scripts?.[scriptName]) {
      fail(`Missing package.json script: ${scriptName}`);
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'README.md'))) {
  fail('README.md is required');
}

process.stdout.write('repo-policy-ok\n');

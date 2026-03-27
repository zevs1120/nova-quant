#!/usr/bin/env node
/**
 * Pre-commit changelog & version policy check.
 *
 * Rules:
 *   1. CHANGELOG.md must be included in every commit (staged).
 *   2. The latest version heading in CHANGELOG.md must match package.json "version".
 *   3. If src/ files are staged, warn when docs/ is untouched (non-blocking).
 *
 * Bypass: set env SKIP_CHANGELOG_CHECK=1 for infra-only commits
 *         (CI config, formatting, dependency bumps).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/* ── helpers ─────────────────────────────────────────────────────────── */

function fail(message) {
  process.stderr.write(`\n\x1b[31m✖ changelog-policy:\x1b[0m ${message}\n\n`);
  process.exit(1);
}

function warn(message) {
  process.stderr.write(`\x1b[33m⚠ changelog-policy:\x1b[0m ${message}\n`);
}

function info(message) {
  process.stdout.write(`\x1b[36mℹ changelog-policy:\x1b[0m ${message}\n`);
}

/* ── bypass ──────────────────────────────────────────────────────────── */

if (process.env.SKIP_CHANGELOG_CHECK === '1') {
  info('Skipped (SKIP_CHANGELOG_CHECK=1).\n');
  process.exit(0);
}

/* ── gather staged files ─────────────────────────────────────────────── */

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

if (staged.length === 0) {
  process.exit(0); // nothing staged
}

/* ── rule 1: CHANGELOG.md must be staged ─────────────────────────────── */

const changelogStaged = staged.includes('CHANGELOG.md');

if (!changelogStaged) {
  fail(
    'CHANGELOG.md is not staged.\n' +
      '  Every commit must include a CHANGELOG.md update describing the change.\n' +
      '  If this is an infra-only commit (CI, formatting, deps), bypass with:\n' +
      '    SKIP_CHANGELOG_CHECK=1 git commit ...',
  );
}

/* ── rule 2: version in package.json == latest heading in CHANGELOG ──── */

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const pkgVersion = pkg.version;

const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const headingMatch = changelog.match(/^## (\d+\.\d+\.\d+)/m);

if (!headingMatch) {
  fail('Could not find a version heading (## x.y.z) in CHANGELOG.md.');
}

const changelogVersion = headingMatch[1];

if (pkgVersion !== changelogVersion) {
  fail(
    `Version mismatch: package.json is "${pkgVersion}" but CHANGELOG.md latest heading is "${changelogVersion}".\n` +
      '  Please sync them. Use: npm run version:minor  or  npm run version:patch',
  );
}

/* ── rule 3 (soft): src/ changes without docs/ update ────────────────── */

const hasSrcChanges = staged.some((f) => f.startsWith('src/'));
const hasDocChanges = staged.some((f) => f.startsWith('docs/') || f === 'architecture.md');

if (hasSrcChanges && !hasDocChanges) {
  warn(
    'src/ files changed without docs/ updates. Consider updating relevant documentation if needed.',
  );
}

/* ── all good ─────────────────────────────────────────────────────────── */

info(`Passed — v${pkgVersion} synced.\n`);

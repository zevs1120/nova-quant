#!/usr/bin/env node
/**
 * Commit-msg hook: validate commit message against project Conventional Commits rules.
 *
 * Rules:
 *   1. Title must match: <type>(<scope>): <subject>  OR  <type>: <subject>
 *   2. Type must be one of the allowed types.
 *   3. Scope (if present) must be from the allowed list or a comma-separated combo.
 *   4. Subject must start with lowercase letter.
 *   5. Subject must not end with a period.
 *   6. Full title line ≤ 72 characters.
 *   7. Title must be in English (no CJK / non-ASCII characters).
 *   8. Body (if present) must be separated from title by a blank line.
 *
 * Usage: node scripts/check-commit-msg.mjs <commit-msg-file>
 */
import fs from 'node:fs';

/* ── config ──────────────────────────────────────────────────────────── */

const ALLOWED_TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci'];

const ALLOWED_SCOPES = [
  // frontend — src/components/, src/hooks/, src/styles/
  'app',
  'landing',
  'admin',
  'onboarding',
  'ui',
  'css',
  'frontend',
  'i18n',
  // server — src/server/ subdirectories
  'api',
  'auth',
  'ai',
  'db',
  'decision',
  'evidence',
  'outcome',
  'research',
  'alpha',
  'ops',
  'ingestion',
  'news',
  'nova',
  'holdings',
  'chat',
  'connect',
  'delivery',
  // engines — src/engines/
  'signal',
  'strategy',
  'risk',
  'regime',
  'velocity',
  'sentiment',
  'pattern',
  'engines',
  // quant & training — src/quant/, src/training/, src/research/
  'market',
  'train',
  // deploy & infra — deployment/, scripts/, .github/
  'ci',
  'deploy',
  'config',
  'scripts',
  'deps',
  'perf',
  // docs
  'docs',
  // top-level modules — server/, model/, backtest/
  'server',
  'model',
  'runtime',
  'tests',
];

const MAX_TITLE_LENGTH = 72;

/* ── helpers ─────────────────────────────────────────────────────────── */

function fail(message) {
  process.stderr.write(`\n\x1b[31m✖ commit-msg:\x1b[0m ${message}\n\n`);
  process.exit(1);
}

function info(message) {
  process.stdout.write(`\x1b[36mℹ commit-msg:\x1b[0m ${message}\n`);
}

/* ── bypass ──────────────────────────────────────────────────────────── */

if (process.env.SKIP_COMMIT_MSG_CHECK === '1') {
  info('Skipped (SKIP_COMMIT_MSG_CHECK=1).\n');
  process.exit(0);
}

/* ── read commit message ─────────────────────────────────────────────── */

const msgFile = process.argv[2];
if (!msgFile) {
  fail('No commit message file provided. This script should be called by the commit-msg hook.');
}

const raw = fs.readFileSync(msgFile, 'utf8').trim();
// Filter out comment lines (lines starting with #)
const lines = raw.split('\n').filter((l) => !l.startsWith('#'));
const title = lines[0]?.trim();

if (!title) {
  fail('Commit message is empty.');
}

// Skip merge commits and fixup/squash commits
if (
  title.startsWith('Merge ') ||
  title.startsWith('Revert ') ||
  title.startsWith('fixup! ') ||
  title.startsWith('squash! ')
) {
  info('Auto-commit detected, skipping validation.\n');
  process.exit(0);
}

/* ── rule 1: format ──────────────────────────────────────────────────── */

// type(scope): subject  OR  type: subject
const titleRegex = /^([a-z]+)(?:\(([a-z0-9,\-]+)\))?:\s(.+)$/;
const match = title.match(titleRegex);

if (!match) {
  fail(
    `Title does not match Conventional Commits format.\n` +
      `  Expected: <type>(<scope>): <subject>  or  <type>: <subject>\n` +
      `  Got:      "${title}"\n` +
      `  Example:  feat(signal): add RSI indicator support`,
  );
}

const [, type, scope, subject] = match;

/* ── rule 2: type ────────────────────────────────────────────────────── */

if (!ALLOWED_TYPES.includes(type)) {
  fail(
    `Invalid type "${type}".\n` +
      `  Allowed: ${ALLOWED_TYPES.join(', ')}`,
  );
}

/* ── rule 3: scope ───────────────────────────────────────────────────── */

if (scope) {
  const scopes = scope.split(',');
  const invalid = scopes.filter((s) => !ALLOWED_SCOPES.includes(s));
  if (invalid.length > 0) {
    fail(
      `Invalid scope: ${invalid.map((s) => `"${s}"`).join(', ')}.\n` +
        `  Allowed: ${ALLOWED_SCOPES.join(', ')}\n` +
        `  Tip: use the most relevant scope, or omit for cross-cutting changes.`,
    );
  }
}

/* ── rule 4: subject starts lowercase ────────────────────────────────── */

if (/^[A-Z]/.test(subject)) {
  fail(
    `Subject must start with a lowercase letter.\n` +
      `  Got: "${subject}"\n` +
      `  Fix: "${subject[0].toLowerCase() + subject.slice(1)}"`,
  );
}

/* ── rule 5: no trailing period ──────────────────────────────────────── */

if (subject.endsWith('.')) {
  fail(`Subject must not end with a period.\n  Got: "${subject}"`);
}

/* ── rule 6: length ──────────────────────────────────────────────────── */

if (title.length > MAX_TITLE_LENGTH) {
  fail(
    `Title is ${title.length} characters (max ${MAX_TITLE_LENGTH}).\n` +
      `  Title: "${title}"`,
  );
}

/* ── rule 7: English only (no CJK or other non-ASCII in title) ───────── */

// Allow basic ASCII + common symbols in title
// eslint-disable-next-line no-control-regex
const nonAsciiMatch = subject.match(/[^\x00-\x7F]/);
if (nonAsciiMatch) {
  fail(
    `Commit title must be in English (ASCII only).\n` +
      `  Found non-ASCII character: "${nonAsciiMatch[0]}"\n` +
      `  Title: "${title}"\n` +
      `  Note: Chinese or other non-English text is allowed in the commit body, not the title.`,
  );
}

/* ── rule 8: blank line between title and body ───────────────────────── */

if (lines.length > 1 && lines[1]?.trim() !== '') {
  fail(
    `Missing blank line between title and body.\n` +
      `  Line 2 should be empty but contains: "${lines[1]}"`,
  );
}

/* ── passed ───────────────────────────────────────────────────────────── */

info(`Passed — ${type}${scope ? `(${scope})` : ''}: ${subject}\n`);

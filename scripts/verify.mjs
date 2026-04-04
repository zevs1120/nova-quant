#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  [['run', 'lint'], {}],
  [['run', 'format:check'], {}],
  [['run', 'typecheck'], {}],
  [['test'], {}],
  [['run', 'build'], {}],
  [['run', 'build:landing'], {}],
  [['run', 'build:admin'], {}],
];

for (const [args, opts] of steps) {
  execFileSync(npmCmd, args, { stdio: 'inherit', ...opts });
}

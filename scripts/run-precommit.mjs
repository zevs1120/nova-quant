#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const nodeCmd = process.execPath;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const steps = [
  ['check-changelog', nodeCmd, ['scripts/check-changelog.mjs']],
  ['verify', npmCmd, ['run', 'verify']],
  ['lint-staged', npxCmd, ['lint-staged']],
];

for (const [label, command, args] of steps) {
  process.stdout.write(`\n[pre-commit] ${label}\n`);
  execFileSync(command, args, {
    stdio: 'inherit',
  });
}

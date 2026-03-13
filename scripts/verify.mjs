#!/usr/bin/env node
import { execSync } from 'node:child_process';

const commands = [
  'npm run lint',
  'npm run typecheck',
  'npm test',
  'npm run build'
];

for (const command of commands) {
  execSync(command, { stdio: 'inherit' });
}

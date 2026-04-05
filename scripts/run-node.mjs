#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const forwardedArgs = process.argv.slice(2);

if (!forwardedArgs.length) {
  process.stderr.write('run-node.mjs requires arguments to forward to node.\n');
  process.exit(1);
}

const supportsNoWebstorage =
  process.allowedNodeEnvironmentFlags instanceof Set &&
  process.allowedNodeEnvironmentFlags.has('--no-webstorage');

const result = spawnSync(
  process.execPath,
  [...(supportsNoWebstorage ? ['--no-webstorage'] : []), ...forwardedArgs],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

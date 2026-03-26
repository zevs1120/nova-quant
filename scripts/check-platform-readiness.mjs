#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const criticalTests = [
  'tests/adminAuthApi.test.ts',
  'tests/authScopeApi.test.ts',
  'tests/passwordResetApi.test.ts',
  'tests/signupWelcomeApi.test.ts',
  'tests/apiCors.test.ts',
  'tests/apiRuntimeState.test.ts',
  'tests/decisionApi.test.ts',
  'tests/adminDataApi.test.ts',
  'tests/controlPlaneStatus.test.ts',
  'tests/alphaDiscoveryLoop.test.ts',
  'tests/novaStrategyFlywheel.test.ts',
  'tests/evolutionCycle.test.ts',
  'tests/autoBackend.test.ts',
  'tests/healthzRoute.test.ts',
];

const steps = [
  {
    label: 'repo policy',
    args: ['run', 'lint'],
  },
  {
    label: 'typecheck',
    args: ['run', 'typecheck'],
  },
  {
    label: 'critical platform tests',
    args: ['test', '--', '--run', ...criticalTests],
  },
  {
    label: 'root web build',
    args: ['run', 'build'],
  },
  {
    label: 'admin build',
    args: ['run', 'build', '--prefix', 'admin'],
  },
  {
    label: 'app build',
    args: ['run', 'build', '--prefix', 'app'],
  },
  {
    label: 'landing build',
    args: ['run', 'build:landing'],
  },
];

for (const step of steps) {
  console.log(`\n[platform-check] ${step.label}`);
  execFileSync(npmCmd, step.args, { stdio: 'inherit' });
}

console.log('\n[platform-check] all critical checks passed');

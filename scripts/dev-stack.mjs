import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();
let shuttingDown = false;

function terminate(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 1500).unref();
}

function startProcess(args) {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
    terminate(exitCode);
  });

  child.on('error', () => {
    terminate(1);
  });

  return child;
}

process.on('SIGINT', () => terminate(0));
process.on('SIGTERM', () => terminate(0));

startProcess(['run', 'api:data']);
startProcess(['run', 'dev:web']);

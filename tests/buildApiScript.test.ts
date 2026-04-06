import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'dist');

describe('build api script', () => {
  afterEach(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  it('validates the api entrypoint and writes a stable dist artifact', () => {
    execFileSync(process.execPath, ['scripts/run-node.mjs', 'scripts/build-api.mjs'], {
      cwd: root,
      stdio: 'pipe',
      env: process.env,
    });

    expect(existsSync(path.join(distDir, 'api-only.txt'))).toBe(true);
    expect(existsSync(path.join(distDir, 'index.html'))).toBe(true);
    expect(readFileSync(path.join(distDir, 'api-only.txt'), 'utf8')).toContain('surface=api-only');
    expect(readFileSync(path.join(distDir, 'index.html'), 'utf8')).toContain(
      'deployment surface is api-only',
    );
  });
});

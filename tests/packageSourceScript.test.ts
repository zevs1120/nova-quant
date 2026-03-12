import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package source script', () => {
  it('exposes clean-source exclusion policy in dry-run mode', () => {
    const root = process.cwd();
    const output = execFileSync('node', [path.join('scripts', 'package-source.mjs'), '--dry-run'], {
      cwd: root,
      encoding: 'utf8'
    });
    const payload = JSON.parse(output) as { excludes: string[]; mode: string };
    expect(payload.mode).toBe('dry-run');
    expect(payload.excludes).toContain('node_modules');
    expect(payload.excludes).toContain('dist');
    expect(payload.excludes).toContain('data/*.db');
    expect(payload.excludes).toContain('__MACOSX');
    expect(payload.excludes).toContain('.DS_Store');
  });
});

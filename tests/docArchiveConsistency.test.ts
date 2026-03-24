import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation archive consistency', () => {
  it('keeps global/final review directories as archived stubs', () => {
    const globalDir = path.join(process.cwd(), 'docs', 'global_review');
    const finalDir = path.join(process.cwd(), 'docs', 'final_review');
    expect(existsSync(globalDir)).toBe(true);
    expect(existsSync(finalDir)).toBe(true);
    const globalFiles = readdirSync(globalDir)
      .filter((name) => !name.startsWith('.'))
      .sort();
    const finalFiles = readdirSync(finalDir)
      .filter((name) => !name.startsWith('.'))
      .sort();
    expect(globalFiles).toEqual(['ARCHIVED.md']);
    expect(finalFiles).toEqual(['ARCHIVED.md']);
  });

  it('retains historical review content under docs/archive', () => {
    const archiveRoot = path.join(process.cwd(), 'docs', 'archive');
    expect(existsSync(path.join(archiveRoot, 'global_review_2026-03-09'))).toBe(true);
    expect(existsSync(path.join(archiveRoot, 'final_review_2026-03-09'))).toBe(true);
  });
});

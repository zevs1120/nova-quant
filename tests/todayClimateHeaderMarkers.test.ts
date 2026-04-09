import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TodayClimateHeader.jsx markers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'today', 'TodayClimateHeader.jsx'),
    'utf8',
  );

  it('owns the climate header chrome', () => {
    expect(source).toContain('today-rebuild-header');
    expect(source).toContain('today-rebuild-climate');
    expect(source).toContain('today-rebuild-status');
  });
});

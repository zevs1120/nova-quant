import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('todayReads slice wiring', () => {
  const queriesPath = path.join(__dirname, '..', 'src', 'server', 'api', 'queries.ts');
  const todayReadsPath = path.join(
    __dirname,
    '..',
    'src',
    'server',
    'api',
    'queries',
    'todayReads.ts',
  );
  const queriesSource = fs.readFileSync(queriesPath, 'utf8');
  const todayReadsSource = fs.readFileSync(todayReadsPath, 'utf8');

  it('loads Today read helpers from the dedicated slice', () => {
    expect(queriesSource).toContain(
      "import { createTodayReadApi } from './queries/todayReads.js';",
    );
    expect(queriesSource).toContain('const {');
    expect(queriesSource).toContain('} = createTodayReadApi({');
  });

  it('keeps decision and engagement exports in the Today slice factory', () => {
    expect(todayReadsSource).toContain('export function createTodayReadApi');
    expect(todayReadsSource).toContain('async function getDecisionSnapshot');
    expect(todayReadsSource).toContain('async function getEngagementState');
    expect(todayReadsSource).toContain('completeMorningCheck');
    expect(todayReadsSource).toContain('completeWeeklyReview');
  });
});

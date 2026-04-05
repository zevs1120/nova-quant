import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('engagementReads slice wiring', () => {
  const queriesPath = path.join(__dirname, '..', 'src', 'server', 'api', 'queries.ts');
  const engagementReadsPath = path.join(
    __dirname,
    '..',
    'src',
    'server',
    'api',
    'queries',
    'engagementReads.ts',
  );
  const queriesSource = fs.readFileSync(queriesPath, 'utf8');
  const engagementReadsSource = fs.readFileSync(engagementReadsPath, 'utf8');

  it('loads engagement helpers from the dedicated slice', () => {
    expect(queriesSource).toContain(
      "import { createEngagementReadApi } from './queries/engagementReads.js';",
    );
    expect(queriesSource).toContain('} = createEngagementReadApi({');
    expect(queriesSource).toContain('getDecisionSnapshot,');
  });

  it('keeps engagement and ritual handlers in the engagement slice factory', () => {
    expect(engagementReadsSource).toContain('export function createEngagementReadApi');
    expect(engagementReadsSource).toContain('async function getEngagementState');
    expect(engagementReadsSource).toContain('async function completeMorningCheck');
    expect(engagementReadsSource).toContain('async function completeWeeklyReview');
    expect(engagementReadsSource).toContain('setNotificationPreferencesState');
  });
});

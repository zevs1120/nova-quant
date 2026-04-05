import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('query slice boundary policy', () => {
  const queriesPath = path.join(__dirname, '..', 'src', 'server', 'api', 'queries.ts');
  const source = fs.readFileSync(queriesPath, 'utf8');

  it('keeps extracted slice factories wired at the composition root', () => {
    expect(source).toContain("import { createTodayReadApi } from './queries/todayReads.js';");
    expect(source).toContain(
      "import { createEngagementReadApi } from './queries/engagementReads.js';",
    );
    expect(source).toContain(
      "import { createPortfolioReadApi } from './queries/portfolioReads.js';",
    );
    expect(source).toContain('createTodayReadApi({');
    expect(source).toContain('createEngagementReadApi({');
    expect(source).toContain('createPortfolioReadApi({');
  });

  it('does not re-inline extracted read handlers into queries.ts', () => {
    expect(source).not.toContain('export async function getRiskProfilePrimary(');
    expect(source).not.toContain('export function getRiskProfile(');
    expect(source).not.toContain('export function listExternalConnections(');
    expect(source).not.toContain('export async function listExternalConnectionsPrimary(');
    expect(source).not.toContain('async function getEngagementState(');
    expect(source).not.toContain('async function completeMorningCheck(');
  });
});

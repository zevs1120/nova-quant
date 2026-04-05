import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('portfolioReads slice wiring', () => {
  const queriesPath = path.join(__dirname, '..', 'src', 'server', 'api', 'queries.ts');
  const portfolioReadsPath = path.join(
    __dirname,
    '..',
    'src',
    'server',
    'api',
    'queries',
    'portfolioReads.ts',
  );
  const queriesSource = fs.readFileSync(queriesPath, 'utf8');
  const portfolioReadsSource = fs.readFileSync(portfolioReadsPath, 'utf8');

  it('loads portfolio helpers from the dedicated slice', () => {
    expect(queriesSource).toContain(
      "import { createPortfolioReadApi } from './queries/portfolioReads.js';",
    );
    expect(queriesSource).toContain('createPortfolioReadApi({');
    expect(queriesSource).toContain('riskProfilePresets: RISK_PROFILE_PRESETS');
  });

  it('keeps risk-profile and connection handlers in the portfolio slice factory', () => {
    expect(portfolioReadsSource).toContain('export function createPortfolioReadApi');
    expect(portfolioReadsSource).toContain('function getRiskProfile');
    expect(portfolioReadsSource).toContain('async function getRiskProfilePrimary');
    expect(portfolioReadsSource).toContain('function setRiskProfile');
    expect(portfolioReadsSource).toContain('async function listExternalConnectionsPrimary');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContextBundle } from '../src/server/chat/tools.js';

describe('chat tools runtime sourcing', () => {
  it('does not include public/mock fallback paths', () => {
    const file = path.join(process.cwd(), 'src/server/chat/tools.ts');
    const text = fs.readFileSync(file, 'utf-8');
    expect(text.includes('public/mock')).toBe(false);
    expect(text.includes('readJsonFile')).toBe(false);
  });

  it('returns context bundle with source transparency', async () => {
    const bundle = await buildContextBundle({
      userId: 'guest-default',
      context: {
        market: 'US'
      },
      message: 'Why this signal?'
    });

    expect(bundle).toBeTruthy();
    expect(bundle.sourceTransparency).toBeTruthy();
    expect(typeof bundle.sourceTransparency.signal_data_status).toBe('string');
    expect(Array.isArray(bundle.signalCards)).toBe(true);
    expect(bundle.statusSummary.length).toBeGreaterThan(0);
    expect(bundle.deterministicGuide).toBeTruthy();
  });

  it('selects research tools for research-style questions', async () => {
    const bundle = await buildContextBundle({
      userId: 'guest-default',
      context: {
        market: 'US',
        assetClass: 'US_STOCK'
      },
      message: 'Compare momentum by regime and tell me if this is overfit'
    });

    expect(bundle.researchContext.research_mode).toBe(true);
    expect(bundle.researchContext.selected_tools).toContain('summarize_research_on_topic');
    expect(bundle.researchContext.selected_tools).toContain('get_backtest_integrity_report');
    expect(bundle.researchContext.selected_tools.length).toBeGreaterThan(2);
  });
});

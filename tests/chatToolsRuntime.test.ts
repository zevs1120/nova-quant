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
        market: 'US',
        decisionSummary: {
          today_call: '今天适合试探，不适合激进',
          risk_posture: 'PROBE',
          top_action_symbol: 'AAPL',
          top_action_label: 'Probe small',
          source_status: 'DB_BACKED',
          data_status: 'DB_BACKED',
        },
        holdingsSummary: {
          holdings_count: 2,
          total_weight_pct: 32,
          risk_level: 'medium',
          recommendation: 'Portfolio risk is active but manageable.',
        },
      },
      message: 'Why this signal?',
    });

    expect(bundle).toBeTruthy();
    expect(bundle.sourceTransparency).toBeTruthy();
    expect(typeof bundle.sourceTransparency.signal_data_status).toBe('string');
    expect(Array.isArray(bundle.signalCards)).toBe(true);
    expect(bundle.statusSummary.length).toBeGreaterThan(0);
    expect(bundle.selectedEvidence.some((line) => line.includes('decision'))).toBe(true);
    expect(bundle.selectedEvidence.some((line) => line.includes('holdings'))).toBe(true);
    expect(bundle.deterministicGuide).toBeTruthy();
  });

  it('selects research tools for research-style questions', async () => {
    const bundle = await buildContextBundle({
      userId: 'guest-default',
      context: {
        market: 'US',
        assetClass: 'US_STOCK',
      },
      message: 'Compare momentum by regime and tell me if this is overfit',
    });

    expect(bundle.researchContext.research_mode).toBe(true);
    expect(bundle.researchContext.selected_tools).toContain('summarize_research_on_topic');
    expect(bundle.researchContext.selected_tools).toContain('get_factor_measured_report');
    expect(bundle.researchContext.selected_tools).toContain('compare_factor_performance_by_regime');
    expect(bundle.researchContext.selected_tools).toContain('get_research_workflow_plan');
    expect(bundle.researchContext.selected_tools.length).toBeGreaterThan(2);
  });

  it('infers requested crypto symbols from plain-language prompts', async () => {
    const bundle = await buildContextBundle({
      userId: 'guest-default',
      context: {
        page: 'ai',
        market: 'CRYPTO',
        assetClass: 'CRYPTO',
      },
      message: 'Review BTC-USDT. Should I keep it, trim it, or sell it?',
    });

    expect(bundle.requestedSymbol).toBe('BTC');
    expect(bundle.requestedMarket).toBe('CRYPTO');
    expect(bundle.selectedEvidence.length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.signalCards)).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMarketState = vi.hoisted(() => vi.fn());
const getPerformanceSummary = vi.hoisted(() => vi.fn());
const getRiskProfile = vi.hoisted(() => vi.fn());
const getRuntimeState = vi.hoisted(() => vi.fn());
const getSignalContract = vi.hoisted(() => vi.fn());
const listAssets = vi.hoisted(() => vi.fn());
const listSignalContracts = vi.hoisted(() => vi.fn());
const answerWithRetrieval = vi.hoisted(() => vi.fn());

vi.mock('../src/server/api/queries.js', () => ({
  getMarketState,
  getPerformanceSummary,
  getRiskProfile,
  getRuntimeState,
  getSignalContract,
  listAssets,
  listSignalContracts,
}));

vi.mock('../src/quant/aiRetrieval.js', () => ({
  answerWithRetrieval,
}));

describe('chat tools request trimming', () => {
  beforeEach(() => {
    vi.resetModules();
    getMarketState.mockReset();
    getPerformanceSummary.mockReset();
    getRiskProfile.mockReset();
    getRuntimeState.mockReset();
    getSignalContract.mockReset();
    listAssets.mockReset();
    listSignalContracts.mockReset();
    answerWithRetrieval.mockReset();

    getRuntimeState.mockReturnValue({
      source_status: 'DB_BACKED',
      data_transparency: { data_status: 'DB_BACKED' },
      data: {},
    });
    getMarketState.mockReturnValue([{ regime_id: 'trend', temperature_percentile: 55 }]);
    getRiskProfile.mockReturnValue({ profile_key: 'balanced', exposure_cap: 1 });
    getPerformanceSummary.mockReturnValue({ records: [] });
    getSignalContract.mockReturnValue(null);
    listAssets.mockReturnValue([]);
    answerWithRetrieval.mockReturnValue({
      intent: 'general',
      ticker: null,
      text: 'cached deterministic note',
    });
  });

  it('reuses the initial signal-card read when the asset scope does not change', async () => {
    listSignalContracts.mockReturnValue([
      {
        symbol: 'SPY',
        market: 'US',
        asset_class: 'US_STOCK',
        status: 'NEW',
        confidence: 0.84,
      },
    ]);

    const { buildContextBundle } = await import('../src/server/chat/tools.js');
    const bundle = await buildContextBundle({
      userId: 'u-signal-reuse',
      context: {
        market: 'US',
        assetClass: 'US_STOCK',
      },
      message: 'Why this signal?',
    });

    expect(listSignalContracts).toHaveBeenCalledTimes(1);
    expect(Array.isArray(bundle.signalCards)).toBe(true);
  });

  it('skips the full asset registry scan for generic prompts with no ticker clue', async () => {
    listSignalContracts.mockReturnValue([]);

    const { buildContextBundle } = await import('../src/server/chat/tools.js');
    const bundle = await buildContextBundle({
      userId: 'u-generic-chat',
      context: {
        market: 'US',
        assetClass: 'US_STOCK',
      },
      message: 'What should I do today?',
    });

    expect(listAssets).not.toHaveBeenCalled();
    expect(bundle.requestedSymbol).toBe(null);
  });
});

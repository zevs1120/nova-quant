import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchApiJson = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/api.js', () => ({
  fetchApi: vi.fn(),
  fetchApiJson,
}));

describe('browseWarmup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('readBrowseHomeSnapshot hydrates from localStorage within TTL', async () => {
    const savedAt = Date.now();
    localStorage.setItem(
      'nq:browse:home:STOCK',
      JSON.stringify({ savedAt, data: { futuresMarkets: [] } }),
    );
    const mod = await import('../src/utils/browseWarmup.js');
    expect(mod.readBrowseHomeSnapshot('STOCK')).toEqual({ futuresMarkets: [] });
  });

  it('readBrowseHomeSnapshot ignores expired or corrupt storage', async () => {
    localStorage.setItem('nq:browse:home:STOCK', 'not-json');
    localStorage.setItem(
      'nq:browse:home:CRYPTO',
      JSON.stringify({ savedAt: Date.now() - 999 * 60 * 1000, data: {} }),
    );
    const mod = await import('../src/utils/browseWarmup.js');
    expect(mod.readBrowseHomeSnapshot('STOCK')).toBe(null);
    expect(mod.readBrowseHomeSnapshot('CRYPTO')).toBe(null);
  });

  it('warmBrowseHomeSnapshot coalesces inflight requests', async () => {
    let resolveFn!: (v: unknown) => void;
    const slow = new Promise((resolve) => {
      resolveFn = resolve;
    });
    fetchApiJson.mockReturnValueOnce(slow);
    const mod = await import('../src/utils/browseWarmup.js');
    const a = mod.warmBrowseHomeSnapshot('STOCK');
    const b = mod.warmBrowseHomeSnapshot('STOCK');
    resolveFn!({ futuresMarkets: [] });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual({ futuresMarkets: [] });
    expect(rb).toEqual({ futuresMarkets: [] });
    expect(fetchApiJson).toHaveBeenCalledTimes(1);
  });

  it('warmBrowseHomeSnapshot respects force to bypass short fresh window', async () => {
    fetchApiJson.mockResolvedValue({ ok: 1 });
    const mod = await import('../src/utils/browseWarmup.js');
    await mod.warmBrowseHomeSnapshot('STOCK');
    await mod.warmBrowseHomeSnapshot('STOCK', { force: true });
    expect(fetchApiJson).toHaveBeenCalledTimes(2);
  });

  it('warmBrowseUniverseSnapshot normalizes non-array payload to []', async () => {
    fetchApiJson.mockResolvedValue({ data: null });
    const mod = await import('../src/utils/browseWarmup.js');
    const rows = await mod.warmBrowseUniverseSnapshot('US');
    expect(rows).toEqual([]);
    expect(mod.readBrowseUniverseSnapshot('US')).toEqual([]);
  });

  it('searchBrowseUniverseLocal ranks symbol match above partial name', async () => {
    const savedAt = Date.now();
    localStorage.setItem(
      'nq:browse:universe:US',
      JSON.stringify({
        savedAt,
        data: [
          { symbol: 'META', market: 'US', name: 'Meta Platforms', venue: 'NASDAQ' },
          { symbol: 'MELI', market: 'US', name: 'MercadoLibre', venue: 'NASDAQ' },
        ],
      }),
    );
    const mod = await import('../src/utils/browseWarmup.js');
    const hits = mod.searchBrowseUniverseLocal('mel', { market: 'US', limit: 5 });
    expect(hits[0].symbol).toBe('MELI');
  });

  it('readBrowseDetailSnapshot returns null for empty selection', async () => {
    const mod = await import('../src/utils/browseWarmup.js');
    expect(mod.readBrowseDetailSnapshot({})).toBe(null);
    expect(mod.readBrowseDetailSnapshot({ market: '', symbol: '' })).toBe(null);
  });

  it('warmBrowseDetailSnapshot merges chart/overview/news and tolerates partial failures', async () => {
    fetchApiJson.mockImplementation((url: string) => {
      if (String(url).includes('/chart')) return Promise.resolve({ series: [1] });
      if (String(url).includes('/overview')) return Promise.reject(new Error('overview down'));
      if (String(url).includes('/news')) return Promise.resolve({ data: [{ id: 1 }] });
      return Promise.resolve(null);
    });
    const mod = await import('../src/utils/browseWarmup.js');
    const payload = await mod.warmBrowseDetailSnapshot({ market: 'US', symbol: 'SPY' });
    expect(payload.chart).toEqual({ series: [1] });
    expect(payload.overview).toBe(null);
    expect(payload.news).toEqual([{ id: 1 }]);
  });

  it('primeBrowseDetailSelections ignores items missing symbol or market', async () => {
    fetchApiJson.mockImplementation(() =>
      Promise.resolve({ chart: null, overview: null, data: [] }),
    );
    const mod = await import('../src/utils/browseWarmup.js');
    await mod.primeBrowseDetailSelections([
      { market: 'US', symbol: 'SPY' },
      { market: '', symbol: 'X' },
      null,
    ]);
    expect(fetchApiJson).toHaveBeenCalled();
  });
});

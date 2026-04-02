import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchApiJson = vi.hoisted(() => vi.fn());

vi.mock('../src/utils/api.js', () => ({
  fetchApi: vi.fn(),
  fetchApiJson,
}));

describe('signalDetails', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hasSignalDetailPayload respects payload.kind', async () => {
    const { hasSignalDetailPayload } = await import('../src/utils/signalDetails.js');
    expect(hasSignalDetailPayload(null)).toBe(false);
    expect(hasSignalDetailPayload({})).toBe(false);
    expect(hasSignalDetailPayload({ payload: {} })).toBe(false);
    expect(hasSignalDetailPayload({ payload: { kind: 'x' } })).toBe(true);
  });

  it('mergeSignalDetail prefers detail ids and preserves summary fields', async () => {
    const { mergeSignalDetail } = await import('../src/utils/signalDetails.js');
    expect(mergeSignalDetail({ a: 1 }, null)).toEqual({ a: 1 });
    const merged = mergeSignalDetail(
      { signal_id: 's1', extra: true },
      { id: 'd1', rationale: 'r' },
    );
    expect(merged.id).toBe('d1');
    expect(merged.signal_id).toBe('d1');
    expect(merged.extra).toBe(true);
    expect(merged.rationale).toBe('r');
  });

  it('mergeSignalDetail falls back to summary ids when detail omits them', async () => {
    const { mergeSignalDetail } = await import('../src/utils/signalDetails.js');
    const m = mergeSignalDetail({ id: 'x', signal_id: 'y' }, { foo: 1 });
    expect(m.id).toBe('x');
    expect(m.signal_id).toBe('y');
  });

  it('fetchSignalDetail returns null for blank id', async () => {
    const { fetchSignalDetail } = await import('../src/utils/signalDetails.js');
    expect(await fetchSignalDetail('  ')).toBe(null);
    expect(await fetchSignalDetail(null)).toBe(null);
  });

  it('fetchSignalDetail dedupes concurrent requests for same key', async () => {
    fetchApiJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: { id: 'sig-1', kind: 'test' } }), 20);
        }),
    );
    const { fetchSignalDetail } = await import('../src/utils/signalDetails.js');
    const a = fetchSignalDetail('sig-1', { userId: 'u1' });
    const b = fetchSignalDetail('sig-1', { userId: 'u1' });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(fetchApiJson).toHaveBeenCalledTimes(1);
  });

  it('fetchSignalDetail caches successful payloads in-module', async () => {
    fetchApiJson.mockResolvedValue({ data: { id: 'cached' } });
    const { fetchSignalDetail } = await import('../src/utils/signalDetails.js');
    await fetchSignalDetail('abc');
    await fetchSignalDetail('abc');
    expect(fetchApiJson).toHaveBeenCalledTimes(1);
  });

  it('fetchSignalDetail does not cache null data responses', async () => {
    fetchApiJson.mockResolvedValue({ data: null });
    const { fetchSignalDetail } = await import('../src/utils/signalDetails.js');
    await fetchSignalDetail('missing');
    await fetchSignalDetail('missing');
    expect(fetchApiJson.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('fetchSignalDetail encodes signal id and optional userId query', async () => {
    fetchApiJson.mockResolvedValue({ data: null });
    const { fetchSignalDetail } = await import('../src/utils/signalDetails.js');
    await fetchSignalDetail('a/b', { userId: 'user#1' });
    expect(fetchApiJson).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('a/b')),
      expect.any(Object),
    );
    const path = String(fetchApiJson.mock.calls[0][0]);
    expect(path).toContain('userId=');
  });
});

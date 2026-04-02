import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/utils/time.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/server/utils/time.js')>();
  return { ...mod, sleep: () => Promise.resolve() };
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, 'fetch');
  } else {
    globalThis.fetch = originalFetch;
  }
});

describe('downloadToFile', () => {
  it('pipes web body into createWriteStream', async () => {
    const sink = new PassThrough();
    const wsSpy = vi
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue(sink as unknown as ReturnType<typeof fs.createWriteStream>);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const { downloadToFile } = await import('../src/server/utils/http.js');
    await downloadToFile('https://example.com/bin', '/tmp/x.bin', { attempts: 1, baseDelayMs: 1 });

    expect(wsSpy).toHaveBeenCalledWith('/tmp/x.bin');
    wsSpy.mockRestore();
  });

  it('throws when response is missing body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    } as Response);
    const { downloadToFile } = await import('../src/server/utils/http.js');
    await expect(
      downloadToFile('https://example.com/x', '/tmp/y', { attempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/Failed download/);
  });
});

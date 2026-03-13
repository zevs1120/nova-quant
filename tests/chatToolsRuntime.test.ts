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
});

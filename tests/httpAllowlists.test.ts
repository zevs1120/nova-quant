import { describe, expect, it } from 'vitest';
import {
  CROSS_ORIGIN_READ_PATHS,
  USER_SCOPED_CACHE_PATHS,
  VERCEL_PUBLIC_BROWSER_PATH_SET,
} from '../src/server/api/httpAllowlists.js';

describe('httpAllowlists', () => {
  it('keeps runtime-state in Express cross-origin reads', () => {
    expect(CROSS_ORIGIN_READ_PATHS).toContain('/api/runtime-state');
  });

  it('excludes runtime-state from Vercel inline public handler set', () => {
    expect(VERCEL_PUBLIC_BROWSER_PATH_SET.has('/api/runtime-state')).toBe(false);
  });

  it('still lists runtime-state as user-scoped for Cache-Control', () => {
    expect(USER_SCOPED_CACHE_PATHS).toContain('/api/runtime-state');
  });

  it('includes Vercel-only public roots', () => {
    expect(VERCEL_PUBLIC_BROWSER_PATH_SET.has('/api')).toBe(true);
    expect(VERCEL_PUBLIC_BROWSER_PATH_SET.has('/api/healthz')).toBe(true);
    expect(VERCEL_PUBLIC_BROWSER_PATH_SET.has('/api/decision/today')).toBe(true);
  });
});

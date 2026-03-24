import { describe, expect, it } from 'vitest';
import {
  ProviderEmptyResponseError,
  ProviderRateLimitError,
  ProviderSchemaError,
  ProviderTimeoutError,
  shouldFallbackProviderError,
} from '../src/server/chat/providers/errors.js';

describe('provider fallback policy', () => {
  it('falls back for rate limits, timeouts, schema issues, and empty responses', () => {
    expect(shouldFallbackProviderError(new ProviderRateLimitError('429'))).toBe(true);
    expect(shouldFallbackProviderError(new ProviderTimeoutError('timeout'))).toBe(true);
    expect(shouldFallbackProviderError(new ProviderSchemaError('schema mismatch'))).toBe(true);
    expect(shouldFallbackProviderError(new ProviderEmptyResponseError('empty response'))).toBe(
      true,
    );
  });

  it('falls back for generic network-like failures', () => {
    expect(shouldFallbackProviderError(new Error('fetch failed'))).toBe(true);
    expect(shouldFallbackProviderError(new Error('network timeout'))).toBe(true);
  });
});

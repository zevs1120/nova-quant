import { describe, expect, it } from 'vitest';
import type express from 'express';
import { parseMarketAndAssetFromQuery } from '../src/server/api/helpers.js';

function mockReq(query: Record<string, unknown>): express.Request {
  return { query } as express.Request;
}

describe('parseMarketAndAssetFromQuery', () => {
  it('returns undefined pair when query is empty', () => {
    expect(parseMarketAndAssetFromQuery(mockReq({}))).toEqual({
      market: undefined,
      assetClass: undefined,
    });
  });

  it('parses valid market and assetClass', () => {
    expect(parseMarketAndAssetFromQuery(mockReq({ market: 'us', assetClass: 'us_stock' }))).toEqual(
      { market: 'US', assetClass: 'US_STOCK' },
    );
  });

  it('ignores invalid values like parseMarket / parseAssetClass', () => {
    expect(parseMarketAndAssetFromQuery(mockReq({ market: 'EU', assetClass: 'BONDS' }))).toEqual({
      market: undefined,
      assetClass: undefined,
    });
  });
});

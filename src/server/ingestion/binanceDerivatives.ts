import { getConfig } from '../config.js';
import { MarketRepository } from '../db/repository.js';
import { fetchWithRetry } from '../utils/http.js';
import { logInfo, logWarn } from '../utils/log.js';
import { sleep } from '../utils/time.js';

type FundingRatePayloadRow = {
  fundingRate?: string;
  fundingTime?: number | string;
  symbol?: string;
};

type PremiumIndexPayload = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  estimatedSettlePrice?: string;
  lastFundingRate?: string;
  interestRate?: string;
  nextFundingTime?: number | string;
  time?: number | string;
};

function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : Number.NaN;
}

function round(value: number, digits = 6): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function inferBaseQuote(symbol: string): { base: string; quote: string } {
  const upper = String(symbol || '').trim().toUpperCase();
  const quoteCandidates = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH'];
  for (const quote of quoteCandidates) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return {
        base: upper.slice(0, -quote.length),
        quote
      };
    }
  }
  return {
    base: upper,
    quote: 'USDT'
  };
}

function derivativeConfig() {
  const cfg = getConfig();
  return {
    baseUrl: String(cfg.binanceRest.baseUrl || 'https://fapi.binance.com').replace(/\/+$/, ''),
    retry: cfg.binanceRest.retry,
    historyLimit: Math.max(8, Number(cfg.binanceDerivatives?.historyLimit || 90)),
    requestDelayMs: Math.max(0, Number(cfg.binanceDerivatives?.requestDelayMs || cfg.binanceRest.requestDelayMs || 180)),
    timeoutMs: Math.max(4_000, Number(cfg.binanceDerivatives?.timeoutMs || 12_000))
  };
}

async function fetchFundingRateHistory(symbol: string): Promise<Array<{ ts_open: number; funding_rate: string }>> {
  const cfg = derivativeConfig();
  const url = new URL(`${cfg.baseUrl}/fapi/v1/fundingRate`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('limit', String(cfg.historyLimit));

  const response = await fetchWithRetry(url.toString(), {}, cfg.retry, cfg.timeoutMs);
  if (!response.ok) {
    throw new Error(`Funding history failed (${response.status}) for ${symbol}`);
  }

  const payload = (await response.json()) as FundingRatePayloadRow[];
  if (!Array.isArray(payload)) return [];

  return payload
    .map((row) => ({
      ts_open: Number(row.fundingTime),
      funding_rate: String(row.fundingRate ?? '').trim()
    }))
    .filter((row) => Number.isFinite(row.ts_open) && row.funding_rate)
    .sort((a, b) => a.ts_open - b.ts_open);
}

async function fetchPremiumIndex(symbol: string): Promise<PremiumIndexPayload | null> {
  const cfg = derivativeConfig();
  const url = new URL(`${cfg.baseUrl}/fapi/v1/premiumIndex`);
  url.searchParams.set('symbol', symbol);

  const response = await fetchWithRetry(url.toString(), {}, cfg.retry, cfg.timeoutMs);
  if (!response.ok) {
    throw new Error(`Premium index failed (${response.status}) for ${symbol}`);
  }

  const payload = (await response.json()) as PremiumIndexPayload;
  return payload && typeof payload === 'object' ? payload : null;
}

function basisBpsFromPremium(payload: PremiumIndexPayload): number | null {
  const mark = safeNumber(payload.markPrice);
  const index = safeNumber(payload.indexPrice);
  if (!Number.isFinite(mark) || !Number.isFinite(index) || index <= 0) return null;
  return round(((mark / index) - 1) * 10_000, 4);
}

export async function syncBinanceDerivatives(params: {
  repo: MarketRepository;
  symbols: string[];
}) {
  const cfg = derivativeConfig();
  const summary = {
    symbols_processed: 0,
    funding_points: 0,
    basis_points: 0,
    latest_funding_symbols: 0,
    latest_basis_symbols: 0,
    symbols: [] as Array<{
      symbol: string;
      funding_inserted: number;
      basis_inserted: number;
      latest_funding_rate: number | null;
      latest_basis_bps: number | null;
    }>
  };

  for (const rawSymbol of params.symbols) {
    const symbol = String(rawSymbol || '').trim().toUpperCase();
    if (!symbol) continue;

    const { base, quote } = inferBaseQuote(symbol);
    const asset = params.repo.upsertAsset({
      symbol,
      market: 'CRYPTO',
      venue: 'BINANCE_UM',
      base,
      quote,
      status: 'ACTIVE'
    });

    let fundingInserted = 0;
    let basisInserted = 0;
    let latestFundingRate: number | null = null;
    let latestBasisBps: number | null = null;

    try {
      const fundingRows = await fetchFundingRateHistory(symbol);
      if (fundingRows.length) {
        fundingInserted = params.repo.upsertFundingRates(asset.asset_id, fundingRows, 'BINANCE_FUNDING_HISTORY');
        latestFundingRate = safeNumber(fundingRows[fundingRows.length - 1]?.funding_rate);
      }
    } catch (error) {
      logWarn('Funding history sync failed', {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await sleep(cfg.requestDelayMs);

    try {
      const premium = await fetchPremiumIndex(symbol);
      const basisBps = premium ? basisBpsFromPremium(premium) : null;
      const tsOpen = Number(premium?.time) || Date.now();

      if (Number.isFinite(basisBps)) {
        basisInserted = params.repo.upsertBasisSnapshots(
          asset.asset_id,
          [
            {
              ts_open: tsOpen,
              basis_bps: String(basisBps)
            }
          ],
          'BINANCE_PREMIUM_INDEX'
        );
        latestBasisBps = basisBps;
      }

      const lastFundingRate = safeNumber(premium?.lastFundingRate);
      if (!Number.isFinite(latestFundingRate) && Number.isFinite(lastFundingRate)) {
        params.repo.upsertFundingRates(
          asset.asset_id,
          [
            {
              ts_open: tsOpen,
              funding_rate: String(round(lastFundingRate, 8))
            }
          ],
          'BINANCE_PREMIUM_INDEX'
        );
        fundingInserted += 1;
        latestFundingRate = round(lastFundingRate, 8);
      }
    } catch (error) {
      logWarn('Premium index sync failed', {
        symbol,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    summary.symbols_processed += 1;
    summary.funding_points += fundingInserted;
    summary.basis_points += basisInserted;
    if (Number.isFinite(latestFundingRate)) summary.latest_funding_symbols += 1;
    if (Number.isFinite(latestBasisBps)) summary.latest_basis_symbols += 1;
    summary.symbols.push({
      symbol,
      funding_inserted: fundingInserted,
      basis_inserted: basisInserted,
      latest_funding_rate: Number.isFinite(latestFundingRate) ? latestFundingRate : null,
      latest_basis_bps: Number.isFinite(latestBasisBps) ? latestBasisBps : null
    });

    logInfo('Binance derivatives sync completed', {
      symbol,
      fundingInserted,
      basisInserted,
      latestFundingRate,
      latestBasisBps
    });

    await sleep(cfg.requestDelayMs);
  }

  return summary;
}

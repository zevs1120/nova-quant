import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectInitialBackfillState,
  parseAutoBackendArgs,
  runAutoBackend,
} from '../scripts/auto-backend.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('auto-backend automation entrypoints', () => {
  it('parses operator flags into a predictable automation config', () => {
    const args = parseAutoBackendArgs([
      '--user',
      'research-user',
      '--port',
      '9898',
      '--derive-interval-sec',
      '120',
      '--validate-every',
      '2',
      '--us-refresh-hours',
      '3',
      '--retrain-hours',
      '12',
      '--train-hours',
      '18',
      '--trainer',
      'mlx-lora',
      '--training-limit',
      '700',
      '--execute-training',
      '--supervisor-check-sec',
      '15',
      '--discovery-hours',
      '8',
      '--skip-api',
      '--skip-worker',
      '--skip-training',
      '--skip-discovery',
      '--once',
    ]);

    expect(args.userId).toBe('research-user');
    expect(args.apiPort).toBe(9898);
    expect(args.deriveIntervalSec).toBe(120);
    expect(args.validateEvery).toBe(2);
    expect(args.usRefreshHours).toBe(3);
    expect(args.retrainHours).toBe(12);
    expect(args.trainEveryHours).toBe(18);
    expect(args.trainer).toBe('mlx-lora');
    expect(args.trainingLimit).toBe(700);
    expect(args.executeTraining).toBe(true);
    expect(args.supervisorCheckSec).toBe(15);
    expect(args.discoveryEveryHours).toBe(8);
    expect(args.skipApi).toBe(true);
    expect(args.skipWorker).toBe(true);
    expect(args.skipTraining).toBe(true);
    expect(args.skipDiscovery).toBe(true);
    expect(args.once).toBe(true);
  });

  it('supports a no-side-effect once mode for smoke testing automation startup', async () => {
    await expect(
      runAutoBackend([
        '--once',
        '--skip-init',
        '--skip-api',
        '--skip-worker',
        '--skip-training',
        '--skip-discovery',
      ]),
    ).resolves.toBeUndefined();
  });

  it('skips initial backfill when representative symbols already have fresh bars', () => {
    const nowMs = Date.UTC(2026, 2, 30, 12, 0, 0);
    const latestBarTs = nowMs - 2 * 60 * 60 * 1000;
    const repo = {
      getAssetBySymbol: (_market: string, symbol: string) => ({
        asset_id: symbol.charCodeAt(0),
      }),
      getOhlcv: () => [
        {
          ts_open: latestBarTs,
        },
      ],
    };

    const result = inspectInitialBackfillState({
      repo: repo as any,
      market: 'CRYPTO',
      timeframe: '1h',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      nowMs,
    });

    expect(result.skip).toBe(true);
    expect(result.reason).toBe('READY');
    expect(result.ready).toBe(3);
  });

  it('forces initial backfill when representative bars are missing or stale', () => {
    const nowMs = Date.UTC(2026, 2, 30, 12, 0, 0);
    const staleBarTs = nowMs - 5 * 24 * 60 * 60 * 1000;
    const repo = {
      getAssetBySymbol: (_market: string, symbol: string) =>
        symbol === 'BTCUSDT'
          ? {
              asset_id: 1,
            }
          : null,
      getOhlcv: () => [
        {
          ts_open: staleBarTs,
        },
      ],
    };

    const result = inspectInitialBackfillState({
      repo: repo as any,
      market: 'CRYPTO',
      timeframe: '1h',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      nowMs,
    });

    expect(result.skip).toBe(false);
    expect(result.reason).toBe('EMPTY');
    expect(result.ready).toBe(0);
  });
});

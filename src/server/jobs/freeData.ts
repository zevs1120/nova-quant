import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import type { Market } from '../types.js';
import { MarketRepository } from '../db/repository.js';
import { syncBinanceDerivatives } from '../ingestion/binanceDerivatives.js';
import { ensureFreshNewsForUniverse } from '../news/provider.js';
import { createTraceId, recordAuditEvent } from '../observability/spine.js';

export async function runFreeDataFlywheel(args: {
  repo: MarketRepository;
  market?: Market | 'ALL';
  triggerType?: 'scheduled' | 'manual' | 'shadow' | 'replay';
  userId?: string | null;
  refreshNews?: boolean;
  refreshCryptoStructure?: boolean;
  cryptoSymbols?: string[];
}) {
  const market = args.market || 'ALL';
  const now = Date.now();
  const workflowId = `workflow-free-data-${randomUUID().slice(0, 12)}`;
  const traceId = createTraceId('free-data');

  args.repo.upsertWorkflowRun({
    id: workflowId,
    workflow_key: 'free_data_flywheel',
    workflow_version: 'free-data-flywheel.v1',
    trigger_type: args.triggerType || 'manual',
    status: 'RUNNING',
    trace_id: traceId,
    input_json: JSON.stringify({
      market,
      refresh_news: args.refreshNews !== false,
      refresh_crypto_structure: args.refreshCryptoStructure !== false,
      crypto_symbols: args.cryptoSymbols || null
    }),
    output_json: null,
    attempt_count: 1,
    started_at_ms: now,
    updated_at_ms: now,
    completed_at_ms: null
  });

  try {
    const cfg = getConfig();
    const output = {
      workflow_id: workflowId,
      trace_id: traceId,
      market,
      news:
        args.refreshNews === false
          ? { skipped: true }
          : await ensureFreshNewsForUniverse({
              repo: args.repo,
              market
            }),
      crypto_structure:
        args.refreshCryptoStructure === false || market === 'US'
          ? { skipped: true }
          : await syncBinanceDerivatives({
              repo: args.repo,
              symbols: args.cryptoSymbols?.length ? args.cryptoSymbols : cfg.markets.CRYPTO.symbols
            })
    };

    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'free_data_flywheel',
      workflow_version: 'free-data-flywheel.v1',
      trigger_type: args.triggerType || 'manual',
      status: 'SUCCEEDED',
      trace_id: traceId,
      input_json: JSON.stringify({
        market,
        refresh_news: args.refreshNews !== false,
        refresh_crypto_structure: args.refreshCryptoStructure !== false,
        crypto_symbols: args.cryptoSymbols || null
      }),
      output_json: JSON.stringify(output),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });

    recordAuditEvent(args.repo, {
      traceId,
      scope: 'free_data_flywheel',
      eventType: 'FREE_DATA_FLYWHEEL_COMPLETED',
      userId: args.userId || null,
      entityType: 'workflow_run',
      entityId: workflowId,
      payload: output
    });

    return output;
  } catch (error) {
    args.repo.upsertWorkflowRun({
      id: workflowId,
      workflow_key: 'free_data_flywheel',
      workflow_version: 'free-data-flywheel.v1',
      trigger_type: args.triggerType || 'manual',
      status: 'FAILED',
      trace_id: traceId,
      input_json: JSON.stringify({
        market,
        refresh_news: args.refreshNews !== false,
        refresh_crypto_structure: args.refreshCryptoStructure !== false,
        crypto_symbols: args.cryptoSymbols || null
      }),
      output_json: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }),
      attempt_count: 1,
      started_at_ms: now,
      updated_at_ms: Date.now(),
      completed_at_ms: Date.now()
    });

    throw error;
  }
}

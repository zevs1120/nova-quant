import type { MarketRepository } from '../../db/repository.js';
import type { OrderStatusSnapshot } from '../../connect/adapters.js';
import { parseLiveExecutionNote, parseShadowExecutionNote } from './executionLiveNotes.js';

export type LiveOrderStatusResult =
  | { ok: true; order: OrderStatusSnapshot | null }
  | { ok: false; error: string };

function parseJsonValue(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toIso(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

export function executionGovernanceThresholds() {
  const maxDriftBps = Number(process.env.NOVA_EXECUTION_KILL_SWITCH_MAX_DRIFT_BPS || 125);
  const maxDriftBreaches = Number(process.env.NOVA_EXECUTION_KILL_SWITCH_MAX_DRIFT_BREACHES || 2);
  const maxLookupFailures = Number(process.env.NOVA_EXECUTION_KILL_SWITCH_MAX_LOOKUP_FAILURES || 3);
  const maxUnreconciled = Number(process.env.NOVA_EXECUTION_KILL_SWITCH_MAX_UNRECONCILED || 3);
  return {
    max_drift_bps: Number.isFinite(maxDriftBps) && maxDriftBps > 0 ? maxDriftBps : 125,
    max_drift_breaches:
      Number.isFinite(maxDriftBreaches) && maxDriftBreaches > 0 ? maxDriftBreaches : 2,
    max_lookup_failures:
      Number.isFinite(maxLookupFailures) && maxLookupFailures > 0 ? maxLookupFailures : 3,
    max_unreconciled: Number.isFinite(maxUnreconciled) && maxUnreconciled > 0 ? maxUnreconciled : 3,
  };
}

export function orderEffectivePrice(args: {
  filledAvgPrice?: number | null;
  limitPrice?: number | null;
  notional?: number | null;
  qty?: number | null;
}) {
  if (Number.isFinite(Number(args.filledAvgPrice)) && Number(args.filledAvgPrice) > 0) {
    return Number(args.filledAvgPrice);
  }
  if (
    Number.isFinite(Number(args.notional)) &&
    Number(args.notional) > 0 &&
    Number.isFinite(Number(args.qty)) &&
    Number(args.qty) > 0
  ) {
    return Number(args.notional) / Number(args.qty);
  }
  if (Number.isFinite(Number(args.limitPrice)) && Number(args.limitPrice) > 0) {
    return Number(args.limitPrice);
  }
  return null;
}

export function liveOrderState(status: string) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  if (
    [
      'NEW',
      'ACCEPTED',
      'ACCEPTED_FOR_BIDDING',
      'PARTIALLY_FILLED',
      'PENDING_NEW',
      'PENDING_REPLACE',
    ].includes(normalized)
  ) {
    return 'PENDING';
  }
  if (['FILLED', 'DONE', 'CLOSED'].includes(normalized)) return 'FILLED';
  if (['CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(normalized)) return 'CANCELLED';
  return 'UNKNOWN';
}

export function readManualExecutionKillSwitch(repo: MarketRepository, provider?: string) {
  const runs = repo.listWorkflowRuns({
    workflowKey: 'execution_kill_switch',
    limit: 40,
  });
  const normalizedProvider = provider ? String(provider).toUpperCase() : null;
  const applicable = runs
    .map((run) => ({
      run,
      output: asObject(parseJsonValue(run.output_json)),
    }))
    .filter(({ output }) => {
      const scopeProvider = output.provider ? String(output.provider).toUpperCase() : null;
      if (!normalizedProvider) return scopeProvider === null;
      return scopeProvider === null || scopeProvider === normalizedProvider;
    })[0];

  if (!applicable) {
    return {
      enabled: false,
      provider: normalizedProvider,
      reason: null as string | null,
      updated_at: null as string | null,
    };
  }

  return {
    enabled: Boolean(applicable.output.enabled),
    provider: applicable.output.provider ? String(applicable.output.provider).toUpperCase() : null,
    reason: applicable.output.reason ? String(applicable.output.reason) : null,
    updated_at: toIso(applicable.run.updated_at_ms),
  };
}

type GetLiveOrderStatusFn = (args: {
  provider: string;
  orderId?: string;
  clientOrderId?: string;
  symbol?: string;
}) => Promise<LiveOrderStatusResult>;

export async function buildExecutionReconciliation(args: {
  repo: MarketRepository;
  userId: string;
  provider?: string;
  limit?: number;
  refreshOrders?: boolean;
  getLiveOrderStatus: GetLiveOrderStatusFn;
}) {
  const thresholds = executionGovernanceThresholds();
  const normalizedProvider = args.provider ? String(args.provider).toUpperCase() : null;
  const liveExecutions = args.repo
    .listExecutions({
      userId: args.userId,
      mode: 'LIVE',
      limit: Math.max(1, Math.min(30, args.limit || 12)),
    })
    .filter((row) => {
      const note = parseLiveExecutionNote(row.note);
      if (!note) return false;
      if (!normalizedProvider) return true;
      return note.provider === normalizedProvider;
    });
  const paperExecutions = args.repo
    .listExecutions({
      userId: args.userId,
      mode: 'PAPER',
      limit: 200,
    })
    .filter((row) => parseShadowExecutionNote(row.note));
  const shadowByLiveExecutionId = new Map(
    paperExecutions
      .map((row) => {
        const note = parseShadowExecutionNote(row.note);
        return note?.paired_live_execution_id
          ? ([note.paired_live_execution_id, row] as const)
          : null;
      })
      .filter((row): row is readonly [string, (typeof paperExecutions)[number]] => Boolean(row)),
  );

  const rows = [] as Array<Record<string, unknown>>;
  for (const execution of liveExecutions) {
    const storedNote = parseLiveExecutionNote(execution.note);
    if (!storedNote) continue;
    const shadow = shadowByLiveExecutionId.get(execution.execution_id) || null;
    const shadowNote = parseShadowExecutionNote(shadow?.note);
    const statusLookup =
      args.refreshOrders && storedNote.order_id
        ? await args.getLiveOrderStatus({
            provider: storedNote.provider,
            orderId: storedNote.order_id,
            clientOrderId: storedNote.client_order_id || undefined,
            symbol: execution.symbol,
          })
        : ({
            ok: true as const,
            order: null as OrderStatusSnapshot | null,
          } satisfies LiveOrderStatusResult);
    const liveOrder = statusLookup.ok ? statusLookup.order : null;
    const effectiveStatus = liveOrder?.status || storedNote.status || 'UNKNOWN';
    const effectivePrice = orderEffectivePrice({
      filledAvgPrice: liveOrder?.filled_avg_price ?? storedNote.filled_avg_price,
      limitPrice: liveOrder?.limit_price ?? storedNote.limit_price,
      notional: liveOrder?.notional ?? storedNote.notional,
      qty: liveOrder?.filled_qty ?? liveOrder?.qty ?? storedNote.filled_qty ?? storedNote.qty,
    });
    const expectedEntryPrice = storedNote.expected_entry_price ?? execution.entry_price ?? null;
    const paperEntryPrice = shadow?.entry_price ?? shadowNote?.expected_entry_price ?? null;
    const entryGapBps =
      effectivePrice !== null && expectedEntryPrice !== null && expectedEntryPrice > 0
        ? ((effectivePrice - expectedEntryPrice) / expectedEntryPrice) * 10_000
        : null;
    const championVsChallengerGapBps =
      effectivePrice !== null && paperEntryPrice !== null && paperEntryPrice > 0
        ? ((effectivePrice - paperEntryPrice) / paperEntryPrice) * 10_000
        : null;

    let reconciliationStatus = 'RECONCILED';
    if (!statusLookup.ok) {
      reconciliationStatus = 'LOOKUP_FAILED';
    } else if (liveOrderState(effectiveStatus) === 'PENDING') {
      reconciliationStatus = 'PENDING';
    } else if (liveOrderState(effectiveStatus) === 'CANCELLED') {
      reconciliationStatus = 'CANCELLED';
    } else if (!shadow) {
      reconciliationStatus = 'NO_CHALLENGER';
    } else if (
      (entryGapBps !== null && Math.abs(entryGapBps) > thresholds.max_drift_bps) ||
      (championVsChallengerGapBps !== null &&
        Math.abs(championVsChallengerGapBps) > thresholds.max_drift_bps)
    ) {
      reconciliationStatus = 'DRIFT';
    }

    rows.push({
      execution_id: execution.execution_id,
      signal_id: execution.signal_id,
      symbol: execution.symbol,
      market: execution.market,
      provider: storedNote.provider,
      route_key: storedNote.routing.route_key,
      champion_mode: storedNote.routing.champion_mode,
      challenger_mode: storedNote.routing.challenger_mode,
      shadow_execution_id: shadow?.execution_id || storedNote.routing.shadow_execution_id || null,
      order_id: storedNote.order_id,
      client_order_id: storedNote.client_order_id,
      live_status: effectiveStatus,
      reconciliation_status: reconciliationStatus,
      lookup_error: !statusLookup.ok ? statusLookup.error : null,
      expected_entry_price: expectedEntryPrice,
      live_effective_price: effectivePrice,
      paper_entry_price: paperEntryPrice,
      entry_gap_bps: entryGapBps !== null ? Number(entryGapBps.toFixed(2)) : null,
      challenger_gap_bps:
        championVsChallengerGapBps !== null ? Number(championVsChallengerGapBps.toFixed(2)) : null,
      strategy_id: storedNote.strategy_id,
      strategy_family: storedNote.strategy_family,
      signal_score: storedNote.signal_score,
      submitted_at:
        liveOrder?.submitted_at ||
        storedNote.submitted_at ||
        new Date(execution.created_at_ms).toISOString(),
      execution_guard: storedNote.execution_guard || null,
    });
  }

  const avg = (field: 'entry_gap_bps' | 'challenger_gap_bps') => {
    const values = rows.map((row) => Number(row[field])).filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  };

  return {
    rows,
    shadow_count: paperExecutions.length,
    paired_count: rows.filter((row) => row.shadow_execution_id).length,
    summary: {
      total: rows.length,
      reconciled: rows.filter((row) => row.reconciliation_status === 'RECONCILED').length,
      pending: rows.filter((row) => row.reconciliation_status === 'PENDING').length,
      drift: rows.filter((row) => row.reconciliation_status === 'DRIFT').length,
      lookup_failed: rows.filter((row) => row.reconciliation_status === 'LOOKUP_FAILED').length,
      no_challenger: rows.filter((row) => row.reconciliation_status === 'NO_CHALLENGER').length,
      cancelled: rows.filter((row) => row.reconciliation_status === 'CANCELLED').length,
      avg_entry_gap_bps: avg('entry_gap_bps'),
      avg_challenger_gap_bps: avg('challenger_gap_bps'),
    },
  };
}

export async function buildExecutionGovernance(args: {
  repo: MarketRepository;
  userId: string;
  provider?: string;
  limit?: number;
  refreshOrders?: boolean;
  getLiveOrderStatus: GetLiveOrderStatusFn;
}) {
  const thresholds = executionGovernanceThresholds();
  const manual = readManualExecutionKillSwitch(args.repo, args.provider);
  const reconciliation = await buildExecutionReconciliation(args);
  const unreconciledCount =
    reconciliation.summary.pending +
    reconciliation.summary.lookup_failed +
    reconciliation.summary.no_challenger +
    reconciliation.summary.drift;
  const autoReasons: string[] = [];

  if (reconciliation.summary.drift >= thresholds.max_drift_breaches) {
    autoReasons.push(
      `Execution drift breached ${reconciliation.summary.drift}/${thresholds.max_drift_breaches} recent live orders.`,
    );
  }
  if (reconciliation.summary.lookup_failed >= thresholds.max_lookup_failures) {
    autoReasons.push(
      `Order-status lookup failed ${reconciliation.summary.lookup_failed}/${thresholds.max_lookup_failures} times.`,
    );
  }
  if (unreconciledCount >= thresholds.max_unreconciled) {
    autoReasons.push(
      `Unreconciled live orders reached ${unreconciledCount}/${thresholds.max_unreconciled}.`,
    );
  }

  const automaticEnabled = autoReasons.length > 0;
  const killSwitchActive = manual.enabled || automaticEnabled;

  return {
    as_of: new Date().toISOString(),
    provider_filter: args.provider ? String(args.provider).toUpperCase() : 'ALL',
    champion_challenger: {
      route_key: 'live_champion_paper_challenger',
      champion_mode: 'LIVE',
      challenger_mode: 'PAPER',
      live_count: reconciliation.summary.total,
      shadow_count: reconciliation.shadow_count,
      paired_count: reconciliation.paired_count,
      recent_pairs: reconciliation.rows.slice(0, 6).map((row) => ({
        execution_id: row.execution_id,
        signal_id: row.signal_id,
        symbol: row.symbol,
        provider: row.provider,
        shadow_execution_id: row.shadow_execution_id,
        strategy_id: row.strategy_id,
        strategy_family: row.strategy_family,
        reconciliation_status: row.reconciliation_status,
      })),
    },
    reconciliation: {
      refreshed: Boolean(args.refreshOrders),
      ...reconciliation,
    },
    kill_switch: {
      active: killSwitchActive,
      mode: manual.enabled ? 'MANUAL' : automaticEnabled ? 'AUTO' : 'OFF',
      manual_enabled: manual.enabled,
      automatic_enabled: automaticEnabled,
      reasons: [...(manual.enabled && manual.reason ? [manual.reason] : []), ...autoReasons],
      thresholds,
      last_manual_update_at: manual.updated_at,
      last_manual_reason: manual.reason,
      provider_scope: manual.provider || null,
    },
  };
}

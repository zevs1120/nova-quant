import type { AssetClass, Market, SignalContract, SignalDirection } from '../../types.js';
import {
  RUNTIME_STATUS,
  normalizeRuntimeStatus,
  withComponentStatus,
} from '../../runtimeStatus.js';

export function toUiSignal(signal: SignalContract): Record<string, unknown> {
  const grade = signal.score >= 75 ? 'A' : signal.score >= 63 ? 'B' : 'C';
  const statusTag =
    signal.tags.find((tag) => String(tag).startsWith('status:'))?.split(':')[1] ||
    RUNTIME_STATUS.MODEL_DERIVED;
  const sourceTag =
    signal.tags.find((tag) => String(tag).startsWith('source:'))?.split(':')[1] ||
    RUNTIME_STATUS.DB_BACKED;
  const status = withComponentStatus({
    overallDataStatus: normalizeRuntimeStatus(statusTag, RUNTIME_STATUS.MODEL_DERIVED),
    componentSourceStatus: normalizeRuntimeStatus(sourceTag, RUNTIME_STATUS.DB_BACKED),
  });
  return {
    ...signal,
    signal_id: signal.id,
    grade,
    source_status: status.source_status,
    source_label: status.source_label,
    data_status: status.data_status,
  };
}

function evidenceFreshnessLabel(createdAtIso: string | null | undefined) {
  const createdAtMs = Date.parse(String(createdAtIso || ''));
  if (!Number.isFinite(createdAtMs)) return '--';
  const freshnessMinutes = Math.max(0, Math.round((Date.now() - createdAtMs) / 60000));
  if (freshnessMinutes < 1) return 'just now';
  if (freshnessMinutes < 60) return `${freshnessMinutes}m ago`;
  return `${Math.floor(freshnessMinutes / 60)}h ago`;
}

function runtimeStatusToEvidenceStatus(status: string) {
  const normalized = normalizeRuntimeStatus(status, RUNTIME_STATUS.INSUFFICIENT_DATA);
  if (normalized === RUNTIME_STATUS.WITHHELD) return 'WITHHELD' as const;
  if (normalized === RUNTIME_STATUS.INSUFFICIENT_DATA) return 'INSUFFICIENT_DATA' as const;
  if (normalized === RUNTIME_STATUS.EXPERIMENTAL) return 'EXPERIMENTAL' as const;
  return 'PARTIAL_DATA' as const;
}

export function buildRuntimeSignalEvidenceFromContracts(
  signals: SignalContract[],
  limit = 3,
  _sourceStatus: string = RUNTIME_STATUS.MODEL_DERIVED,
) {
  return buildRuntimeSignalEvidenceFromSignals(
    signals.map((signal) => toUiSignal(signal)),
    limit,
    _sourceStatus,
  );
}

export function buildRuntimeSignalEvidenceFromSignals(
  signals: Array<Record<string, unknown>>,
  limit = 3,
  _sourceStatus: string = RUNTIME_STATUS.MODEL_DERIVED,
) {
  const records = signals
    .map((signal) => {
      const createdAtText = String(signal.created_at || signal.generated_at || '');
      const createdAtMs = Date.parse(createdAtText);
      const freshnessMinutes = Number.isFinite(createdAtMs)
        ? Math.max(0, Math.round((Date.now() - createdAtMs) / 60000))
        : 0;
      const signalDataStatus = normalizeRuntimeStatus(
        String(signal.data_status || signal.source_label || signal.source_status || ''),
        RUNTIME_STATUS.MODEL_DERIVED,
      );
      const evidenceStatus = runtimeStatusToEvidenceStatus(signalDataStatus);
      const actionable =
        ['NEW', 'TRIGGERED'].includes(String(signal.status || '').toUpperCase()) &&
        signalDataStatus !== RUNTIME_STATUS.WITHHELD &&
        signalDataStatus !== RUNTIME_STATUS.INSUFFICIENT_DATA;
      const entryZone =
        signal.entry_zone && typeof signal.entry_zone === 'object'
          ? (signal.entry_zone as Record<string, unknown>)
          : null;
      const stopLoss =
        signal.stop_loss && typeof signal.stop_loss === 'object'
          ? (signal.stop_loss as Record<string, unknown>)
          : null;
      const explainBullets = Array.isArray(signal.explain_bullets)
        ? signal.explain_bullets
        : Array.isArray(signal.rationale)
          ? signal.rationale
          : [];
      const invalidationValue = Number(stopLoss?.price ?? signal.invalidation_level);
      return {
        signal_id: String(signal.signal_id || signal.id || ''),
        symbol: String(signal.symbol || ''),
        market: (String(signal.market || 'US').toUpperCase() === 'CRYPTO'
          ? 'CRYPTO'
          : 'US') as Market,
        asset_class: (String(signal.asset_class || 'US_STOCK').toUpperCase() === 'CRYPTO'
          ? 'CRYPTO'
          : 'US_STOCK') as AssetClass,
        timeframe: String(signal.timeframe || ''),
        direction: (String(signal.direction || 'LONG').toUpperCase() === 'SHORT'
          ? 'SHORT'
          : String(signal.direction || 'LONG').toUpperCase() === 'FLAT'
            ? 'FLAT'
            : 'LONG') as SignalDirection,
        conviction: Number(signal.confidence || signal.conviction || 0),
        regime_id: String(signal.regime_id || '--'),
        thesis: String(explainBullets[0] || entryZone?.notes || signal.summary || '--'),
        entry_zone: signal.entry_zone || null,
        invalidation: Number.isFinite(invalidationValue) ? invalidationValue : null,
        source_transparency: {
          source_status: RUNTIME_STATUS.MODEL_DERIVED,
          data_status: RUNTIME_STATUS.MODEL_DERIVED,
          source_label: RUNTIME_STATUS.MODEL_DERIVED,
          evidence_mode: 'RUNTIME_SIGNAL_FALLBACK',
          validation_mode: 'REPLAY_PENDING',
        },
        evidence_status: evidenceStatus,
        freshness_minutes: freshnessMinutes,
        freshness_label: evidenceFreshnessLabel(createdAtText),
        actionable,
        created_at: createdAtText || null,
        supporting_run_id: null,
        strategy_version_id: signal.strategy_version || null,
        dataset_version_id: null,
        reconciliation_status: 'REPLAY_DATA_UNAVAILABLE',
        replay_paper_evidence_available: false,
      };
    })
    .sort((a, b) => Number(b.conviction || 0) - Number(a.conviction || 0))
    .slice(0, Math.max(1, Math.min(8, limit)));

  return {
    asof: new Date().toISOString(),
    source_status: records.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    data_status: records.length ? RUNTIME_STATUS.MODEL_DERIVED : RUNTIME_STATUS.INSUFFICIENT_DATA,
    supporting_run_id: null,
    dataset_version_id: null,
    strategy_version_id: records[0]?.strategy_version_id || null,
    records,
  };
}

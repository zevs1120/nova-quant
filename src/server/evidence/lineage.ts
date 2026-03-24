import { RUNTIME_STATUS, normalizeRuntimeStatus } from '../runtimeStatus.js';

export const EVIDENCE_MODE = {
  LIVE: 'LIVE',
  PAPER: 'PAPER',
  REPLAY: 'REPLAY',
  BACKTEST: 'BACKTEST',
  DEMO: 'DEMO',
  MIXED: 'MIXED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type EvidenceMode = (typeof EVIDENCE_MODE)[keyof typeof EVIDENCE_MODE];

export type EvidenceLineage = {
  market_data_mode: EvidenceMode;
  performance_mode: EvidenceMode;
  validation_mode: EvidenceMode;
  display_mode: EvidenceMode;
  source_status: string;
  data_status: string;
  demo: boolean;
};

export function normalizeEvidenceMode(
  value: unknown,
  fallback: EvidenceMode = EVIDENCE_MODE.UNAVAILABLE,
): EvidenceMode {
  const candidate = String(value || '')
    .trim()
    .toUpperCase();
  if (candidate in EVIDENCE_MODE) {
    return candidate as EvidenceMode;
  }
  return fallback;
}

export function deriveMarketDataMode(args: {
  runtimeStatus?: unknown;
  demo?: boolean;
}): EvidenceMode {
  if (args.demo) return EVIDENCE_MODE.DEMO;
  const status = normalizeRuntimeStatus(args.runtimeStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  if (status === RUNTIME_STATUS.DB_BACKED || status === RUNTIME_STATUS.REALIZED)
    return EVIDENCE_MODE.LIVE;
  if (status === RUNTIME_STATUS.DEMO_ONLY) return EVIDENCE_MODE.DEMO;
  return EVIDENCE_MODE.UNAVAILABLE;
}

export function derivePerformanceMode(args: {
  performanceStatus?: unknown;
  demo?: boolean;
}): EvidenceMode {
  if (args.demo) return EVIDENCE_MODE.DEMO;
  const status = normalizeRuntimeStatus(args.performanceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA);
  if (status === RUNTIME_STATUS.REALIZED) return EVIDENCE_MODE.LIVE;
  if (status === RUNTIME_STATUS.PAPER_ONLY) return EVIDENCE_MODE.PAPER;
  if (status === RUNTIME_STATUS.BACKTEST_ONLY) return EVIDENCE_MODE.BACKTEST;
  if (status === RUNTIME_STATUS.DEMO_ONLY) return EVIDENCE_MODE.DEMO;
  return EVIDENCE_MODE.UNAVAILABLE;
}

export function deriveValidationMode(args: {
  replayEvidenceAvailable?: unknown;
  paperEvidenceAvailable?: unknown;
  performanceMode?: EvidenceMode;
  demo?: boolean;
}): EvidenceMode {
  if (args.demo) return EVIDENCE_MODE.DEMO;
  if (Boolean(args.replayEvidenceAvailable)) return EVIDENCE_MODE.REPLAY;
  if (Boolean(args.paperEvidenceAvailable) || args.performanceMode === EVIDENCE_MODE.PAPER)
    return EVIDENCE_MODE.PAPER;
  if (args.performanceMode === EVIDENCE_MODE.BACKTEST) return EVIDENCE_MODE.BACKTEST;
  if (args.performanceMode === EVIDENCE_MODE.LIVE) return EVIDENCE_MODE.LIVE;
  return EVIDENCE_MODE.UNAVAILABLE;
}

export function chooseDisplayMode(args: {
  marketDataMode: EvidenceMode;
  performanceMode: EvidenceMode;
  validationMode: EvidenceMode;
  demo?: boolean;
}): EvidenceMode {
  if (args.demo) return EVIDENCE_MODE.DEMO;
  const modes = [args.marketDataMode, args.performanceMode, args.validationMode].filter(
    (mode) => mode !== EVIDENCE_MODE.UNAVAILABLE,
  );
  const distinct = [...new Set(modes)];
  if (!distinct.length) return EVIDENCE_MODE.UNAVAILABLE;
  if (distinct.length === 1) return distinct[0] as EvidenceMode;
  if (distinct.includes(EVIDENCE_MODE.LIVE) && distinct.includes(EVIDENCE_MODE.REPLAY))
    return EVIDENCE_MODE.MIXED;
  if (distinct.includes(EVIDENCE_MODE.LIVE) && distinct.includes(EVIDENCE_MODE.PAPER))
    return EVIDENCE_MODE.MIXED;
  if (distinct.includes(EVIDENCE_MODE.PAPER) && distinct.includes(EVIDENCE_MODE.BACKTEST))
    return EVIDENCE_MODE.MIXED;
  return distinct[0] as EvidenceMode;
}

export function buildEvidenceLineage(args: {
  runtimeStatus?: unknown;
  performanceStatus?: unknown;
  replayEvidenceAvailable?: unknown;
  paperEvidenceAvailable?: unknown;
  sourceStatus?: unknown;
  dataStatus?: unknown;
  demo?: boolean;
}): EvidenceLineage {
  const marketDataMode = deriveMarketDataMode({
    runtimeStatus: args.runtimeStatus,
    demo: args.demo,
  });
  const performanceMode = derivePerformanceMode({
    performanceStatus: args.performanceStatus,
    demo: args.demo,
  });
  const validationMode = deriveValidationMode({
    replayEvidenceAvailable: args.replayEvidenceAvailable,
    paperEvidenceAvailable: args.paperEvidenceAvailable,
    performanceMode,
    demo: args.demo,
  });
  return {
    market_data_mode: marketDataMode,
    performance_mode: performanceMode,
    validation_mode: validationMode,
    display_mode: chooseDisplayMode({
      marketDataMode,
      performanceMode,
      validationMode,
      demo: args.demo,
    }),
    source_status: normalizeRuntimeStatus(args.sourceStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    data_status: normalizeRuntimeStatus(args.dataStatus, RUNTIME_STATUS.INSUFFICIENT_DATA),
    demo: Boolean(args.demo),
  };
}

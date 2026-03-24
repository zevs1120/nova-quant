export const RUNTIME_STATUS = {
  DB_BACKED: 'DB_BACKED',
  REALIZED: 'REALIZED',
  PAPER_ONLY: 'PAPER_ONLY',
  BACKTEST_ONLY: 'BACKTEST_ONLY',
  MODEL_DERIVED: 'MODEL_DERIVED',
  EXPERIMENTAL: 'EXPERIMENTAL',
  DISCONNECTED: 'DISCONNECTED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NO_CREDENTIALS: 'NO_CREDENTIALS',
  WITHHELD: 'WITHHELD',
  DEMO_ONLY: 'DEMO_ONLY',
} as const;

export type RuntimeStatus = (typeof RUNTIME_STATUS)[keyof typeof RUNTIME_STATUS];

const RUNTIME_STATUS_SET = new Set<string>(Object.values(RUNTIME_STATUS));

export function normalizeRuntimeStatus(
  value: unknown,
  fallback: RuntimeStatus = RUNTIME_STATUS.INSUFFICIENT_DATA,
): RuntimeStatus {
  const candidate = String(value || '')
    .trim()
    .toUpperCase();
  if (RUNTIME_STATUS_SET.has(candidate)) {
    return candidate as RuntimeStatus;
  }
  return fallback;
}

export function derivePerformanceSourceStatus(labels: string[]): RuntimeStatus {
  if (labels.includes('LIVE')) return RUNTIME_STATUS.REALIZED;
  if (labels.includes('PAPER')) return RUNTIME_STATUS.PAPER_ONLY;
  if (labels.includes('BACKTEST')) return RUNTIME_STATUS.BACKTEST_ONLY;
  return RUNTIME_STATUS.INSUFFICIENT_DATA;
}

export function withComponentStatus(args: {
  overallDataStatus: RuntimeStatus;
  componentSourceStatus: RuntimeStatus;
}): {
  source_status: RuntimeStatus;
  data_status: RuntimeStatus;
  source_label: RuntimeStatus;
} {
  const overall = normalizeRuntimeStatus(args.overallDataStatus);
  const componentSource = normalizeRuntimeStatus(args.componentSourceStatus);

  const componentDataStatus = overall === RUNTIME_STATUS.DB_BACKED ? componentSource : overall;

  return {
    source_status: componentSource,
    data_status: componentDataStatus,
    source_label: componentDataStatus,
  };
}

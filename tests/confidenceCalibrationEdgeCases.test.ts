import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Confidence calibration tests.
 * Since createConfidenceCalibrator needs a MarketRepository, we test the math
 * by exercising it through the public API with a minimal mock repo.
 */

function makeMockRepo(executions: any[] = [], signals: Map<string, any> = new Map()) {
  return {
    listExecutions: (_args: any) => executions,
    getSignal: (id: string) => signals.get(id) || null,
  } as any;
}

describe('confidence calibration — sizing bands', () => {
  // Test the sizing band logic extracted from the module
  // We import at test time to avoid module-level side effects
  let createConfidenceCalibrator: any;

  beforeEach(async () => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    const mod = await import('../src/server/confidence/calibration.js');
    createConfidenceCalibrator = mod.createConfidenceCalibrator;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns valid calibrator with empty execution history', () => {
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(),
      userId: 'test-user',
    });
    expect(calibrator.summary.sample_size).toBe(0);
    expect(calibrator.summary.ece).toBe(0);
    expect(calibrator.summary.brier).toBe(0);
  });

  it('calibrateSignal returns all required fields for signal with no history', () => {
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(),
      userId: 'test-user',
    });
    const result = calibrator.calibrateSignal({
      signal_id: 'sig-1',
      market: 'US',
      direction: 'LONG',
      regime_id: 'RGM_RISK_ON',
      confidence: 0.7,
    });
    expect(result.raw_confidence).toBeCloseTo(0.7, 2);
    expect(result.calibrated_confidence).toBeGreaterThan(0);
    expect(result.calibrated_confidence).toBeLessThanOrEqual(0.94);
    expect(result.direction_confidence).toBeGreaterThan(0);
    expect(result.return_confidence).toBeGreaterThan(0);
    expect(result.execution_confidence).toBeGreaterThan(0);
    expect(result.risk_confidence).toBeGreaterThan(0);
    expect(result.calibration_bucket).toBeTruthy();
    expect(typeof result.calibration_sample_size).toBe('number');
    expect(typeof result.bucket_win_rate).toBe('number');
    expect(['tiny', 'light', 'base', 'press']).toContain(result.sizing_band);
    expect(result.sizing_multiplier).toBeGreaterThan(0);
    expect(result.sizing_multiplier).toBeLessThanOrEqual(1.05);
  });

  it('confidence clamps to [0.01, 0.99]', () => {
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(),
      userId: 'test-user',
    });
    const low = calibrator.calibrateSignal({ confidence: 0, market: 'US', direction: 'LONG' });
    const high = calibrator.calibrateSignal({ confidence: 1, market: 'US', direction: 'LONG' });
    expect(low.raw_confidence).toBeGreaterThanOrEqual(0.01);
    expect(high.raw_confidence).toBeLessThanOrEqual(0.99);
  });

  it('calibrated confidence stays within [0.18, 0.94]', () => {
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(),
      userId: 'test-user',
    });
    const veryLow = calibrator.calibrateSignal({
      confidence: 0.01,
      market: 'US',
      direction: 'LONG',
    });
    const veryHigh = calibrator.calibrateSignal({
      confidence: 0.99,
      market: 'US',
      direction: 'LONG',
    });
    expect(veryLow.calibrated_confidence).toBeGreaterThanOrEqual(0.18);
    expect(veryHigh.calibrated_confidence).toBeLessThanOrEqual(0.94);
  });

  it('higher raw confidence generally produces higher calibrated confidence with no history', () => {
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(),
      userId: 'test-user',
    });
    const lowConf = calibrator.calibrateSignal({
      confidence: 0.3,
      market: 'US',
      direction: 'LONG',
    });
    const highConf = calibrator.calibrateSignal({
      confidence: 0.85,
      market: 'US',
      direction: 'LONG',
    });
    expect(highConf.calibrated_confidence).toBeGreaterThan(lowConf.calibrated_confidence);
  });
});

describe('confidence calibration — with execution history', () => {
  let createConfidenceCalibrator: any;

  beforeEach(async () => {
    vi.stubEnv('NOVA_AUTH_DRIVER', '');
    vi.stubEnv('SUPABASE_DB_URL', '');
    vi.stubEnv('DATABASE_URL', '');
    const mod = await import('../src/server/confidence/calibration.js');
    createConfidenceCalibrator = mod.createConfidenceCalibrator;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds non-zero summary with real execution history', () => {
    const signals = new Map<string, any>();
    const executions: any[] = [];
    for (let i = 0; i < 12; i++) {
      const sigId = `sig-${i}`;
      signals.set(sigId, {
        market: 'US',
        direction: 'LONG',
        regime_id: 'RGM_RISK_ON',
        confidence: 0.5 + i * 0.03,
      });
      executions.push({
        signal_id: sigId,
        action: 'DONE',
        pnl_pct: i % 3 === 0 ? -1.5 : 2.5,
      });
    }

    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(executions, signals),
      userId: 'test-user',
    });
    expect(calibrator.summary.sample_size).toBe(12);
    expect(calibrator.summary.brier).toBeGreaterThan(0);
  });

  it('calibrates with execution_confidence reflecting sample size', () => {
    const signals = new Map<string, any>();
    const executions: any[] = [];
    for (let i = 0; i < 24; i++) {
      const sigId = `sig-${i}`;
      signals.set(sigId, {
        market: 'US',
        direction: 'LONG',
        regime_id: 'RGM_RISK_ON',
        confidence: 0.6,
      });
      executions.push({
        signal_id: sigId,
        action: 'DONE',
        pnl_pct: i % 2 === 0 ? 2 : -1,
      });
    }

    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(executions, signals),
      userId: 'test-user',
    });
    const result = calibrator.calibrateSignal({
      market: 'US',
      direction: 'LONG',
      regime_id: 'RGM_RISK_ON',
      confidence: 0.6,
    });
    // With 24 samples, execution_confidence should be significant
    expect(result.execution_confidence).toBeGreaterThanOrEqual(0.25);
    expect(result.calibration_sample_size).toBeGreaterThan(0);
  });

  it('skips executions without matching signal', () => {
    const executions = [{ signal_id: 'missing-sig', action: 'DONE', pnl_pct: 5 }];
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(executions),
      userId: 'test-user',
    });
    expect(calibrator.summary.sample_size).toBe(0);
  });

  it('only includes DONE/CLOSE executions', () => {
    const signals = new Map<string, any>();
    signals.set('sig-1', {
      market: 'US',
      direction: 'LONG',
      regime_id: 'RGM_RISK_ON',
      confidence: 0.6,
    });
    const executions = [
      { signal_id: 'sig-1', action: 'PENDING', pnl_pct: 3 },
      { signal_id: 'sig-1', action: 'OPEN', pnl_pct: 2 },
    ];
    const calibrator = createConfidenceCalibrator({
      repo: makeMockRepo(executions, signals),
      userId: 'test-user',
    });
    expect(calibrator.summary.sample_size).toBe(0);
  });
});

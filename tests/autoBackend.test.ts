import { describe, expect, it } from 'vitest';
import { parseAutoBackendArgs, runAutoBackend } from '../scripts/auto-backend.js';

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
      '--skip-api',
      '--skip-worker',
      '--skip-training',
      '--once'
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
    expect(args.skipApi).toBe(true);
    expect(args.skipWorker).toBe(true);
    expect(args.skipTraining).toBe(true);
    expect(args.once).toBe(true);
  });

  it('supports a no-side-effect once mode for smoke testing automation startup', async () => {
    await expect(
      runAutoBackend(['--once', '--skip-init', '--skip-api', '--skip-worker', '--skip-training'])
    ).resolves.toBeUndefined();
  });
});

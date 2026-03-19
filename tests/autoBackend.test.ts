import { describe, expect, it } from 'vitest';
import { parseAutoBackendArgs, runAutoBackend } from '../scripts/auto-backend.ts';

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
      '--skip-api',
      '--skip-worker',
      '--once'
    ]);

    expect(args.userId).toBe('research-user');
    expect(args.apiPort).toBe(9898);
    expect(args.deriveIntervalSec).toBe(120);
    expect(args.validateEvery).toBe(2);
    expect(args.usRefreshHours).toBe(3);
    expect(args.retrainHours).toBe(12);
    expect(args.skipApi).toBe(true);
    expect(args.skipWorker).toBe(true);
    expect(args.once).toBe(true);
  });

  it('supports a no-side-effect once mode for smoke testing automation startup', async () => {
    await expect(
      runAutoBackend(['--once', '--skip-init', '--skip-api', '--skip-worker'])
    ).resolves.toBeUndefined();
  });
});

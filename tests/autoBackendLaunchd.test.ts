import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAutoBackendCommand, buildLaunchdPlist } from '../scripts/auto-backend-launchd.js';

describe('auto-backend launchd helper', () => {
  it('builds a stable unattended auto-backend command', () => {
    const command = buildAutoBackendCommand({
      label: 'com.novaquant.auto-backend',
      repoDir: '/tmp/nova-quant',
      logsDir: '/tmp/nova-quant/logs/auto-backend',
      userId: 'guest-default',
      port: 8787,
      deriveIntervalSec: 300,
      validateEvery: 6,
      usRefreshHours: 6,
      retrainHours: 24,
      trainHours: 24,
      trainer: 'mlx-lora',
      trainingLimit: 600,
      supervisorCheckSec: 20,
      executeTraining: true,
    });

    expect(command).toContain("'npm' 'run' 'auto:backend' '--'");
    expect(command).toContain("'--execute-training'");
    expect(command).toContain("'--trainer' 'mlx-lora'");
    expect(command).toContain("'--training-limit' '600'");
  });

  it('renders a launchd plist with keepalive and repo-specific logs', () => {
    const plist = buildLaunchdPlist({
      label: 'com.novaquant.auto-backend',
      repoDir: '/tmp/nova-quant',
      logsDir: '/tmp/nova-quant/logs/auto-backend',
      userId: 'guest-default',
      port: 8787,
      deriveIntervalSec: 300,
      validateEvery: 6,
      usRefreshHours: 6,
      retrainHours: 24,
      trainHours: 24,
      trainer: 'mlx-lora',
      trainingLimit: 500,
      supervisorCheckSec: 20,
      executeTraining: false,
    });

    expect(plist).toContain('<key>KeepAlive</key>');
    expect(plist).toContain('<true/>');
    expect(plist).toContain('/tmp/nova-quant');
    expect(plist).toContain(path.join('/tmp/nova-quant/logs/auto-backend', 'stdout.log'));
    expect(plist).toContain('com.novaquant.auto-backend');
  });
});

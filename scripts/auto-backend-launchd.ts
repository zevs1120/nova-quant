import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type AutoBackendLaunchdOptions = {
  label: string;
  repoDir: string;
  logsDir: string;
  userId: string;
  port: number;
  deriveIntervalSec: number;
  validateEvery: number;
  usRefreshHours: number;
  retrainHours: number;
  trainHours: number;
  trainer: 'mlx-lora' | 'unsloth-lora' | 'axolotl-qlora';
  trainingLimit: number;
  supervisorCheckSec: number;
  executeTraining: boolean;
};

const DEFAULT_OPTIONS: AutoBackendLaunchdOptions = {
  label: 'com.novaquant.auto-backend',
  repoDir: process.cwd(),
  logsDir: path.join(process.cwd(), 'logs', 'auto-backend'),
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
};

function shellEscape(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv: string[]) {
  const out = {
    ...DEFAULT_OPTIONS,
    outPath: path.join(process.cwd(), 'deployment', 'launchd', `${DEFAULT_OPTIONS.label}.plist`),
    write: false,
    install: false,
    uninstall: false,
    status: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');

    if (key === 'label' && next) out.label = String(next).trim() || out.label;
    if (key === 'repo-dir' && next) out.repoDir = path.resolve(String(next));
    if (key === 'logs-dir' && next) out.logsDir = path.resolve(String(next));
    if (key === 'out' && next) out.outPath = path.resolve(String(next));
    if (key === 'user' && next) out.userId = String(next).trim() || out.userId;
    if (key === 'port' && next) out.port = Math.max(1, Number(next) || out.port);
    if (key === 'derive-interval-sec' && next)
      out.deriveIntervalSec = Math.max(30, Number(next) || out.deriveIntervalSec);
    if (key === 'validate-every' && next)
      out.validateEvery = Math.max(1, Number(next) || out.validateEvery);
    if (key === 'us-refresh-hours' && next)
      out.usRefreshHours = Math.max(1, Number(next) || out.usRefreshHours);
    if (key === 'retrain-hours' && next)
      out.retrainHours = Math.max(1, Number(next) || out.retrainHours);
    if (key === 'train-hours' && next) out.trainHours = Math.max(1, Number(next) || out.trainHours);
    if (key === 'trainer' && next)
      out.trainer = String(next).trim() as AutoBackendLaunchdOptions['trainer'];
    if (key === 'training-limit' && next)
      out.trainingLimit = Math.max(1, Number(next) || out.trainingLimit);
    if (key === 'supervisor-check-sec' && next)
      out.supervisorCheckSec = Math.max(5, Number(next) || out.supervisorCheckSec);
    if (key === 'execute-training') out.executeTraining = true;
    if (key === 'write') out.write = true;
    if (key === 'install') out.install = true;
    if (key === 'uninstall') out.uninstall = true;
    if (key === 'status') out.status = true;

    if (consumeNext) i += 1;
  }

  return out;
}

export function buildAutoBackendCommand(options: AutoBackendLaunchdOptions) {
  const args = [
    'npm',
    'run',
    'auto:backend',
    '--',
    '--user',
    options.userId,
    '--port',
    String(options.port),
    '--derive-interval-sec',
    String(options.deriveIntervalSec),
    '--validate-every',
    String(options.validateEvery),
    '--us-refresh-hours',
    String(options.usRefreshHours),
    '--retrain-hours',
    String(options.retrainHours),
    '--train-hours',
    String(options.trainHours),
    '--trainer',
    options.trainer,
    '--training-limit',
    String(options.trainingLimit),
    '--supervisor-check-sec',
    String(options.supervisorCheckSec),
  ];

  if (options.executeTraining) args.push('--execute-training');

  return args.map((part) => shellEscape(part)).join(' ');
}

export function buildLaunchdPlist(options: AutoBackendLaunchdOptions) {
  const stdoutPath = path.join(options.logsDir, 'stdout.log');
  const stderrPath = path.join(options.logsDir, 'stderr.log');
  const command = buildAutoBackendCommand(options);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${options.label}</string>
  <key>WorkingDirectory</key>
  <string>${options.repoDir}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${command}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${stderrPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>${os.homedir()}</string>
  </dict>
</dict>
</plist>
`;
}

function launchAgentPath(label: string) {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
}

function currentGuiDomain() {
  const uid =
    typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID || 0);
  return `gui/${uid}`;
}

function installService(plistPath: string, label: string) {
  const target = launchAgentPath(label);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(plistPath, target);
  try {
    execFileSync('launchctl', ['bootout', currentGuiDomain(), target], { stdio: 'ignore' });
  } catch {
    // ignore if not already loaded
  }
  execFileSync('launchctl', ['bootstrap', currentGuiDomain(), target], { stdio: 'inherit' });
  execFileSync('launchctl', ['kickstart', '-k', `${currentGuiDomain()}/${label}`], {
    stdio: 'inherit',
  });
  return target;
}

function uninstallService(label: string) {
  const target = launchAgentPath(label);
  try {
    execFileSync('launchctl', ['bootout', currentGuiDomain(), target], { stdio: 'inherit' });
  } catch {
    // ignore when service is absent
  }
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
  return target;
}

function printStatus(label: string) {
  execFileSync('launchctl', ['print', `${currentGuiDomain()}/${label}`], { stdio: 'inherit' });
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.logsDir, { recursive: true });
  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  const plist = buildLaunchdPlist(args);
  fs.writeFileSync(args.outPath, plist);

  if (args.write) {
    process.stdout.write(`${args.outPath}\n`);
  }

  if (args.install) {
    const target = installService(args.outPath, args.label);
    process.stdout.write(`Installed launchd service at ${target}\n`);
  }

  if (args.status) {
    printStatus(args.label);
  }

  if (args.uninstall) {
    const target = uninstallService(args.label);
    process.stdout.write(`Removed launchd service at ${target}\n`);
  }

  if (!args.write && !args.install && !args.status && !args.uninstall) {
    process.stdout.write(plist);
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

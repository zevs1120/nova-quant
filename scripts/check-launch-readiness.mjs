#!/usr/bin/env node
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const allowMissing = args.has('--allow-missing');
const live = args.has('--live');
const json = args.has('--json');
const notify = args.has('--notify');
const alertSmoke = args.has('--alert-smoke');

function pick(names, fallback = '') {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return { name, value };
  }
  return { name: names[0], value: fallback };
}

const envChecks = [
  {
    label: 'landing URL',
    names: ['PLAYWRIGHT_LANDING_URL', 'NOVA_PUBLIC_SITE_URL', 'NOVA_LANDING_URL'],
    fallback: 'https://novaquant.cloud',
    public: true,
  },
  {
    label: 'app URL',
    names: ['PLAYWRIGHT_APP_URL', 'NOVA_PUBLIC_APP_URL', 'NOVA_APP_URL'],
    fallback: 'https://app.novaquant.cloud',
    public: true,
  },
  {
    label: 'admin URL',
    names: ['PLAYWRIGHT_ADMIN_URL', 'NOVA_PUBLIC_ADMIN_URL', 'NOVA_ADMIN_URL'],
    fallback: 'https://admin.novaquant.cloud',
    public: true,
  },
  { label: 'public API URL', names: ['NOVA_PUBLIC_API_URL'], public: true },
  { label: 'test user email', names: ['TEST_USER_EMAIL'] },
  { label: 'test user password', names: ['TEST_USER_PASSWORD'] },
  {
    label: 'Supabase public URL',
    names: ['VITE_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL'],
    public: true,
  },
  {
    label: 'Supabase publishable key',
    names: [
      'VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
    ],
  },
  { label: 'auth database URL', names: ['NOVA_AUTH_DATABASE_URL'] },
  { label: 'data database URL', names: ['NOVA_DATA_DATABASE_URL'] },
  { label: 'Stripe secret key', names: ['STRIPE_SECRET_KEY'] },
  { label: 'Stripe webhook secret', names: ['STRIPE_WEBHOOK_SECRET'] },
  { label: 'Stripe Lite weekly price', names: ['STRIPE_PRICE_LITE_WEEKLY'] },
  { label: 'Stripe Pro weekly price', names: ['STRIPE_PRICE_PRO_WEEKLY'] },
  { label: 'market data key', names: ['MASSIVE_API_KEY'] },
  { label: 'model ingest token', names: ['NOVA_MODEL_INGEST_TOKEN'] },
  {
    label: 'support email',
    names: ['NOVA_SUPPORT_EMAIL', 'SUPPORT_EMAIL'],
    fallback: 'support@novaquant.cloud',
    public: true,
  },
];

if (String(process.env.NOVA_OPS_ALERTS_DISABLED || '').toLowerCase() !== 'true') {
  envChecks.push({
    label: 'ops alert webhook',
    names: ['OPS_ALERT_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL'],
  });
}

if (String(process.env.QLIB_BRIDGE_ENABLED || 'true').toLowerCase() !== 'false') {
  envChecks.push({ label: 'qlib bridge URL', names: ['QLIB_BRIDGE_URL'], public: true });
}

function resolveChecks() {
  return envChecks.map((check) => {
    const resolved = pick(check.names, check.fallback || '');
    const ok = Boolean(resolved.value);
    return {
      label: check.label,
      ok,
      source: resolved.name,
      value: ok && check.public ? resolved.value : ok ? '<set>' : '',
    };
  });
}

async function probe(label, rawUrl, suffix = '') {
  const url = `${rawUrl.replace(/\/$/, '')}${suffix}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    return {
      label,
      url,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function liveChecks(resolved) {
  const byLabel = new Map(resolved.map((row) => [row.label, row]));
  const landingUrl = byLabel.get('landing URL')?.value || '';
  const appUrl = byLabel.get('app URL')?.value || '';
  const adminUrl = byLabel.get('admin URL')?.value || '';
  const apiUrl = byLabel.get('public API URL')?.value || '';
  const qlibUrl = byLabel.get('qlib bridge URL')?.value || '';
  const checks = [];
  if (landingUrl) checks.push(probe('landing', landingUrl));
  if (appUrl) checks.push(probe('app', appUrl));
  if (adminUrl) checks.push(probe('admin', adminUrl));
  if (apiUrl) {
    checks.push(probe('api health', apiUrl, '/healthz'));
    checks.push(probe('api provider config', apiUrl, '/api/auth/provider-config'));
    checks.push(probe('api browse home', apiUrl, '/api/browse/home'));
    checks.push(probe('api asset search', apiUrl, '/api/assets/search?q=AAPL&limit=3'));
  }
  if (qlibUrl) checks.push(probe('qlib bridge status', qlibUrl, '/api/status'));
  return Promise.all(checks);
}

async function postOpsAlert(result, reason = 'launch-check') {
  if (String(process.env.NOVA_OPS_ALERTS_DISABLED || '').toLowerCase() === 'true') {
    return { ok: true, skipped: true, label: 'ops alert disabled' };
  }

  const webhook = pick(['OPS_ALERT_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL']).value;
  if (!webhook) {
    return {
      ok: false,
      label: 'ops alert webhook',
      error: 'OPS_ALERT_WEBHOOK_URL / DISCORD_WEBHOOK_URL missing',
    };
  }

  const title = alertSmoke
    ? 'NovaQuant launch alert smoke'
    : result.ok
      ? 'NovaQuant launch check passed'
      : 'NovaQuant launch check needs attention';
  const failedLines = [
    ...result.missing.map((label) => `missing env: ${label}`),
    ...result.failedLive.map((label) => `failed live: ${label}`),
  ].slice(0, 12);
  const body = {
    username: 'NovaQuant Ops',
    embeds: [
      {
        title,
        description: alertSmoke
          ? 'Test message from launch readiness check. Confirm the on-call owner can see this.'
          : failedLines.length
            ? failedLines.join('\n')
            : 'Environment, live probes, and readiness checks completed without detected failures.',
        color: result.ok ? 0x25a55f : 0xd64545,
        fields: [
          { name: 'Reason', value: reason, inline: true },
          { name: 'Live checks', value: String(result.live?.length || 0), inline: true },
          { name: 'Missing env', value: String(result.missing.length), inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const startedAt = Date.now();
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        label: 'ops alert webhook',
        status: response.status,
        error: text.slice(0, 200),
        durationMs: Date.now() - startedAt,
      };
    }
    return {
      ok: true,
      label: 'ops alert webhook',
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      label: 'ops alert webhook',
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

function printHuman(result) {
  console.log('\n[launch-check] environment contract');
  for (const row of result.env) {
    const marker = row.ok ? 'ok ' : 'MISS';
    const suffix = row.ok ? ` (${row.source}: ${row.value})` : ` (${row.source})`;
    console.log(`  [${marker}] ${row.label}${suffix}`);
  }

  if (result.live?.length) {
    console.log('\n[launch-check] live reachability');
    for (const row of result.live) {
      const marker = row.ok ? 'ok ' : 'FAIL';
      const detail = row.status ? `HTTP ${row.status}` : row.error || 'request failed';
      console.log(`  [${marker}] ${row.label}: ${detail} (${row.durationMs}ms)`);
    }
  }

  if (result.alert) {
    console.log('\n[launch-check] ops alert');
    const marker = result.alert.ok ? 'ok ' : 'FAIL';
    const detail = result.alert.skipped
      ? result.alert.label
      : result.alert.status
        ? `HTTP ${result.alert.status}`
        : result.alert.error || result.alert.label;
    console.log(`  [${marker}] ${detail}`);
  }

  console.log('\n[launch-check] runbook');
  console.log('  1. npm run verify');
  console.log('  2. npm run check:platform');
  console.log('  3. npm run check:launch -- --live');
  console.log('  4. npm run check:launch -- --alert-smoke');
  console.log('  5. npm run check:launch -- --live --notify');
  console.log(
    '  6. PLAYWRIGHT_E2E_MODE=pro-env npx playwright test tests/pro-env/ --project=chromium --workers=1',
  );
  console.log('  7. Run Stripe test checkout: Lite -> Pro -> cancel -> confirm Free');
  console.log('  8. Manually smoke Free/Lite/Pro card counts and Ask Nova limits');
  console.log(
    '  9. Resolve recent action-card outcomes: POST /api/outcomes/resolve with lookbackDays',
  );
}

const env = resolveChecks();
const liveResult = live ? await liveChecks(env) : [];
const missing = env.filter((row) => !row.ok);
const failedLive = liveResult.filter((row) => !row.ok);
const result = {
  ok: missing.length === 0 && failedLive.length === 0,
  env,
  live: liveResult,
  missing: missing.map((row) => row.label),
  failedLive: failedLive.map((row) => row.label),
  alert: null,
};

if (notify || alertSmoke) {
  result.alert = await postOpsAlert(result, alertSmoke ? 'alert-smoke' : 'launch-check');
  result.ok = result.ok && result.alert.ok;
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

if (!result.ok && !allowMissing) {
  console.error(
    '\n[launch-check] not ready. Fix missing/failed checks above or re-run with --allow-missing for planning output only.',
  );
  process.exitCode = 1;
}

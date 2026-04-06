import path from 'node:path';

function trim(value) {
  return String(value || '').trim();
}

function required(name, fallback, strict = true) {
  const value = trim(process.env[name] || fallback || '');
  if (!value && strict) {
    throw new Error(`[pro-env] Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback = '') {
  return trim(process.env[name] || fallback || '');
}

export function getProEnvConfig(options = {}) {
  const strict = options.strict !== false;
  const rootDir = process.cwd();
  const authDir = path.join(rootDir, 'tests/pro-env/.auth');

  return {
    appUrl: optional(
      'PLAYWRIGHT_APP_URL',
      process.env.NOVA_APP_URL || 'https://app.novaquant.cloud',
    ),
    adminUrl: optional(
      'PLAYWRIGHT_ADMIN_URL',
      process.env.NOVA_ADMIN_URL || 'https://admin.novaquant.cloud',
    ),
    landingUrl: optional(
      'PLAYWRIGHT_LANDING_URL',
      process.env.NOVA_LANDING_URL || 'https://novaquant.cloud',
    ),
    apiUrl: required('NOVA_PUBLIC_API_URL', '', strict),
    qlibBridgeUrl: required('QLIB_BRIDGE_URL', '', strict),
    supabaseUrl: required('VITE_SUPABASE_URL', process.env.SUPABASE_URL, strict),
    supabaseAnonKey: required(
      'VITE_SUPABASE_ANON_KEY',
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
      strict,
    ),
    supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseSchema: optional('NOVA_DATA_PG_SCHEMA', 'public'),
    testUserEmail: required('TEST_USER_EMAIL', '', strict),
    testUserPassword: required('TEST_USER_PASSWORD', '', strict),
    adminEmail: optional('TEST_ADMIN_EMAIL', process.env.TEST_USER_EMAIL),
    adminPassword: optional('TEST_ADMIN_PASSWORD', process.env.TEST_USER_PASSWORD),
    appStorageStatePath: path.join(authDir, 'app-user.json'),
    adminStorageStatePath: path.join(authDir, 'admin-user.json'),
  };
}

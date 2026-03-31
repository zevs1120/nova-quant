import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ quiet: true });

function trim(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return trim(value).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toTimestampExpression(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'now()';
  }
  return `to_timestamp(${numeric / 1000})`;
}

function buildTempPassword() {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    includeInvalid: false,
    sharedTempPassword: '',
    onlyEmails: new Set(),
  };

  argv.forEach((arg) => {
    if (arg === '--apply') {
      options.apply = true;
      return;
    }
    if (arg === '--include-invalid') {
      options.includeInvalid = true;
      return;
    }
    if (arg.startsWith('--temp-password=')) {
      options.sharedTempPassword = arg.slice('--temp-password='.length);
      return;
    }
    if (arg.startsWith('--email=')) {
      options.onlyEmails.add(normalizeEmail(arg.slice('--email='.length)));
      return;
    }
    if (arg.startsWith('--only=')) {
      arg
        .slice('--only='.length)
        .split(',')
        .map((value) => normalizeEmail(value))
        .filter(Boolean)
        .forEach((value) => options.onlyEmails.add(value));
    }
  });

  return options;
}

async function readLegacyUsers(client) {
  const result = await client.query(`
    select
      user_id,
      email,
      name,
      trade_mode,
      broker,
      locale,
      created_at_ms,
      updated_at_ms,
      last_login_at_ms
    from public.auth_users
    order by created_at_ms desc nulls last, updated_at_ms desc nulls last
  `);

  const deduped = new Map();
  result.rows.forEach((row) => {
    const email = normalizeEmail(row.email);
    if (!email || deduped.has(email)) return;
    deduped.set(email, {
      legacyUserId: row.user_id,
      email,
      name: trim(row.name) || email,
      tradeMode: trim(row.trade_mode) || 'active',
      broker: trim(row.broker) || 'Other',
      locale: trim(row.locale) || null,
      createdAtMs: Number(row.created_at_ms) || null,
      updatedAtMs: Number(row.updated_at_ms) || null,
      lastLoginAtMs: Number(row.last_login_at_ms) || null,
    });
  });

  return Array.from(deduped.values());
}

async function readSupabaseEmails(client) {
  const result = await client.query(
    `select lower(email) as email from auth.users where email is not null`,
  );
  return new Set(result.rows.map((row) => normalizeEmail(row.email)).filter(Boolean));
}

async function createSupabaseAuthUser(client, legacyUser, tempPassword) {
  const createdAtExpr = toTimestampExpression(legacyUser.createdAtMs);
  const updatedAtExpr = toTimestampExpression(legacyUser.updatedAtMs || legacyUser.createdAtMs);
  const lastLoginExpr = toTimestampExpression(
    legacyUser.lastLoginAtMs || legacyUser.updatedAtMs || legacyUser.createdAtMs,
  );

  const query = `
    with new_user as (
      insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user,
        is_anonymous
      )
      values (
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        $1::text,
        crypt($2::text, gen_salt('bf')),
        ${lastLoginExpr},
        ${lastLoginExpr},
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
          'name', $3::text,
          'tradeMode', $4::text,
          'broker', $5::text,
          'locale', $6::text,
          'legacyUserId', $7::text,
          'legacyAuthMigratedAt', now(),
          'requiresPasswordReset', true
        ),
        ${createdAtExpr},
        ${updatedAtExpr},
        false,
        false
      )
      returning id, email
    )
    insert into auth.identities (
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    select
      id,
      jsonb_build_object(
        'sub', id::text,
        'email', email,
        'email_verified', true
      ),
      'email',
      email,
      ${lastLoginExpr},
      ${createdAtExpr},
      ${updatedAtExpr}
    from new_user
    returning user_id
  `;

  await client.query(query, [
    legacyUser.email,
    tempPassword,
    legacyUser.name,
    legacyUser.tradeMode,
    legacyUser.broker,
    legacyUser.locale,
    legacyUser.legacyUserId,
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = trim(process.env.NOVA_AUTH_DATABASE_URL);
  if (!databaseUrl) {
    throw new Error('NOVA_AUTH_DATABASE_URL is required.');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const legacyUsers = await readLegacyUsers(client);
    const existingSupabaseEmails = await readSupabaseEmails(client);
    const filteredLegacyUsers = legacyUsers.filter((user) => {
      if (options.onlyEmails.size === 0) return true;
      return options.onlyEmails.has(user.email);
    });

    const invalid = [];
    const alreadyExists = [];
    const candidates = [];

    filteredLegacyUsers.forEach((user) => {
      if (!options.includeInvalid && !isValidEmail(user.email)) {
        invalid.push(user);
        return;
      }
      if (existingSupabaseEmails.has(user.email)) {
        alreadyExists.push(user);
        return;
      }
      candidates.push(user);
    });

    const summary = {
      apply: options.apply,
      sharedTempPassword: Boolean(options.sharedTempPassword),
      legacyUsers: legacyUsers.length,
      selectedUsers: filteredLegacyUsers.length,
      candidates: candidates.length,
      skippedInvalid: invalid.length,
      skippedExisting: alreadyExists.length,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (invalid.length) {
      console.log('\nSkipped invalid emails:');
      invalid.forEach((user) => {
        console.log(`- ${user.email} (${user.legacyUserId})`);
      });
    }

    if (alreadyExists.length) {
      console.log('\nAlready in Supabase Auth:');
      alreadyExists.forEach((user) => {
        console.log(`- ${user.email}`);
      });
    }

    if (!options.apply) {
      console.log('\nDry run only. Re-run with --apply to create missing Supabase Auth users.');
      if (!options.sharedTempPassword) {
        console.log(
          'New users will be created with random temporary passwords and should use the standard password reset flow.',
        );
      }
      return;
    }

    const created = [];
    const failed = [];

    for (const user of candidates) {
      const tempPassword = options.sharedTempPassword || buildTempPassword();
      try {
        await client.query('begin');
        await createSupabaseAuthUser(client, user, tempPassword);
        await client.query('commit');
        created.push({
          email: user.email,
          legacyUserId: user.legacyUserId,
        });
      } catch (error) {
        await client.query('rollback').catch(() => {});
        failed.push({
          email: user.email,
          legacyUserId: user.legacyUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('\nCreated Supabase Auth users:');
    created.forEach((user) => {
      console.log(`- ${user.email} (${user.legacyUserId})`);
    });

    if (failed.length) {
      console.log('\nFailed users:');
      failed.forEach((user) => {
        console.log(`- ${user.email}: ${user.error}`);
      });
      process.exitCode = 1;
    }

    if (!options.sharedTempPassword) {
      console.log(
        '\nPasswords were randomized. Existing users should complete the standard forgot-password flow to set a new password.',
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

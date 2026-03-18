type RedisScalar = string | number;

type RemoteRedisConfig = {
  url: string;
  token: string;
};

const REMOTE_PREFIX = 'nq:auth';

function getRemoteRedisConfig(): RemoteRedisConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ''),
    token
  };
}

export function hasRemoteAuthStore() {
  return Boolean(getRemoteRedisConfig());
}

function getRequiredRemoteRedisConfig(): RemoteRedisConfig {
  const config = getRemoteRedisConfig();
  if (!config) {
    throw new Error('REMOTE_AUTH_STORE_NOT_CONFIGURED');
  }
  return config;
}

type RedisSuccess<T> = { result: T };
type RedisFailure = { error: string };

async function runRedisCommand<T>(command: RedisScalar[]): Promise<T | null> {
  const config = getRequiredRemoteRedisConfig();
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  const payload = (await response.json()) as RedisSuccess<T> | RedisFailure;
  if (!response.ok || 'error' in payload) {
    throw new Error(`REMOTE_AUTH_STORE_COMMAND_FAILED:${'error' in payload ? payload.error : response.status}`);
  }
  return payload.result ?? null;
}

async function runRedisPipeline(commands: RedisScalar[][]): Promise<Array<{ result?: unknown; error?: string }>> {
  const config = getRequiredRemoteRedisConfig();
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  const payload = (await response.json()) as Array<{ result?: unknown; error?: string }> | RedisFailure;
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`REMOTE_AUTH_STORE_PIPELINE_FAILED:${Array.isArray(payload) ? response.status : payload.error}`);
  }
  return payload;
}

function namespaced(key: string) {
  return `${REMOTE_PREFIX}:${key}`;
}

export function remoteUserIdByEmailKey(email: string) {
  return namespaced(`user:email:${email}`);
}

export function remoteUserKey(userId: string) {
  return namespaced(`user:id:${userId}`);
}

export function remoteUserStateKey(userId: string) {
  return namespaced(`state:${userId}`);
}

export function remoteSessionKey(tokenHash: string) {
  return namespaced(`session:${tokenHash}`);
}

export function remoteUserSessionsKey(userId: string) {
  return namespaced(`user-sessions:${userId}`);
}

export function remotePasswordResetKey(userId: string) {
  return namespaced(`reset:${userId}`);
}

export async function remoteGetString(key: string) {
  const result = await runRedisCommand<string>(['GET', key]);
  return typeof result === 'string' ? result : null;
}

export async function remoteGetJson<T>(key: string): Promise<T | null> {
  const raw = await remoteGetString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function remoteSetString(
  key: string,
  value: string,
  options: { nx?: boolean; px?: number } = {}
): Promise<boolean> {
  const command: RedisScalar[] = ['SET', key, value];
  if (options.px) {
    command.push('PX', options.px);
  }
  if (options.nx) {
    command.push('NX');
  }
  const result = await runRedisCommand<string | null>(command);
  return result === 'OK';
}

export async function remoteSetJson(
  key: string,
  value: unknown,
  options: { nx?: boolean; px?: number } = {}
): Promise<boolean> {
  return remoteSetString(key, JSON.stringify(value), options);
}

export async function remoteDeleteKey(key: string) {
  await runRedisCommand<number>(['DEL', key]);
}

export async function remoteDeleteKeys(keys: string[]) {
  if (!keys.length) return;
  await runRedisCommand<number>(['DEL', ...keys]);
}

export async function remoteSetAdd(key: string, member: string) {
  await runRedisCommand<number>(['SADD', key, member]);
}

export async function remoteSetRemove(key: string, member: string) {
  await runRedisCommand<number>(['SREM', key, member]);
}

export async function remoteSetMembers(key: string) {
  const result = await runRedisCommand<string[]>(['SMEMBERS', key]);
  return Array.isArray(result) ? result : [];
}

export async function remoteGetManyJson<T>(keys: string[]): Promise<Array<T | null>> {
  if (!keys.length) return [];
  const responses = await runRedisPipeline(keys.map((key) => ['GET', key]));
  return responses.map((entry) => {
    if (entry.error || typeof entry.result !== 'string') return null;
    try {
      return JSON.parse(entry.result) as T;
    } catch {
      return null;
    }
  });
}

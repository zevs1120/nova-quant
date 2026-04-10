import { createHash } from 'node:crypto';
import type { MarketRepository } from '../../db/repository.js';

type ApiKeyLookupRow = { status: string } | null;

export function createPublicSignalsApiKeyHandlers(deps: {
  getRepo: () => MarketRepository;
  tryPrimaryPostgresRead: <T>(label: string, read: () => Promise<T>) => Promise<T | null>;
  readPostgresApiKeyByHash: (keyHash: string) => Promise<ApiKeyLookupRow>;
}) {
  function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  function ensureDefaultPublicSignalsApiKey(): string {
    const repo = deps.getRepo();
    const plainKey = String(process.env.PUBLIC_SIGNALS_API_KEY || 'nova-public-default-key');
    repo.upsertApiKey({
      key_id: 'public-signals-default',
      key_hash: hashApiKey(plainKey),
      label: 'Default Public Signals Key',
      scope: 'signals:read',
      status: 'ACTIVE',
    });
    return plainKey;
  }

  function verifyPublicSignalsApiKey(rawKey?: string): boolean {
    if (!rawKey) return false;
    ensureDefaultPublicSignalsApiKey();
    const repo = deps.getRepo();
    const row = repo.getApiKeyByHash(hashApiKey(rawKey));
    return Boolean(row && row.status === 'ACTIVE');
  }

  async function verifyPublicSignalsApiKeyPrimary(rawKey?: string): Promise<boolean> {
    if (!rawKey) return false;
    const row = await deps.tryPrimaryPostgresRead('public_api_key', async () =>
      deps.readPostgresApiKeyByHash(hashApiKey(rawKey)),
    );
    if (row) {
      return row.status === 'ACTIVE';
    }
    return verifyPublicSignalsApiKey(rawKey);
  }

  return {
    ensureDefaultPublicSignalsApiKey,
    verifyPublicSignalsApiKey,
    verifyPublicSignalsApiKeyPrimary,
  };
}

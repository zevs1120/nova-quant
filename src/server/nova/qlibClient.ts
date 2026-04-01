import { getConfig } from '../config.js';

export interface QlibSyncRequest {
  force?: boolean;
  symbols?: string[];
}

export interface QlibSyncResult {
  status: string;
  symbols_synced: number;
  rows_exported: number;
  elapsed_ms: number;
  qlib_data_dir: string;
  notes: string[];
}

export interface QlibFactorRequest {
  symbols: string[];
  factors: string[];
  start_date: string;
  end_date: string;
}

export interface QlibFactorResultRow {
  symbol: string;
  date: string;
  factors: Record<string, number | null>;
}

export interface QlibFactorResult {
  status: string;
  factor_set: string;
  factor_count: number;
  row_count: number;
  symbols_used: string[];
  date_range: Record<string, string>;
  elapsed_ms: number;
  rows: QlibFactorResultRow[];
}

export interface QlibModelRequest {
  model_name: string;
  symbols: string[];
  start_date: string;
  end_date: string;
}

export interface QlibModelResult {
  status: string;
  model_name: string;
  elapsed_ms: number;
  predictions: Record<string, Record<string, number>>; // { symbol: { date: float } }
}

function getBridgeConfig() {
  const config = getConfig();
  if (!config.qlibBridge) {
    throw new Error('Qlib Bridge is not configured in AppConfig.');
  }
  return config.qlibBridge;
}

function withTimeoutInit(init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    init: {
      ...init,
      signal: controller.signal,
    },
    clear: () => clearTimeout(timer),
  };
}

export async function checkQlibHealth(): Promise<boolean> {
  const { enabled, baseUrl } = getBridgeConfig();
  if (!enabled) return false;

  const endpoint = `${baseUrl}/api/status`;
  const { init, clear } = withTimeoutInit({ method: 'GET' }, 3000);

  try {
    const res = await fetch(endpoint, init);
    const data = await res.json();
    return res.ok && data.status === 'running';
  } catch (error) {
    return false;
  } finally {
    clear();
  }
}

export async function syncQlibData(req: QlibSyncRequest = {}): Promise<QlibSyncResult> {
  const { enabled, baseUrl } = getBridgeConfig();
  if (!enabled) throw new Error('Qlib Bridge is disabled in configuration.');

  const endpoint = `${baseUrl}/api/data/sync`;
  // Data sync can take arbitrarily long; allow a large timeout (e.g. 5 minutes)
  const { init, clear } = withTimeoutInit(
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    300000,
  );

  try {
    const res = await fetch(endpoint, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qlib sync failed (${res.status}): ${text}`);
    }
    return (await res.json()) as QlibSyncResult;
  } catch (error) {
    throw new Error(
      `Failed to sync Qlib data: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clear();
  }
}

export async function fetchQlibFactors(req: QlibFactorRequest): Promise<QlibFactorResult> {
  const { enabled, baseUrl, timeoutMs } = getBridgeConfig();
  if (!enabled) throw new Error('Qlib Bridge is disabled in configuration.');

  const endpoint = `${baseUrl}/api/factors/compute`;
  const { init, clear } = withTimeoutInit(
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    timeoutMs,
  );

  try {
    const res = await fetch(endpoint, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qlib factor computation failed (${res.status}): ${text}`);
    }
    return (await res.json()) as QlibFactorResult;
  } catch (error) {
    throw new Error(
      `Failed to compute Qlib factors: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clear();
  }
}

export async function predictQlibModel(req: QlibModelRequest): Promise<QlibModelResult> {
  const { enabled, baseUrl, timeoutMs } = getBridgeConfig();
  if (!enabled) throw new Error('Qlib Bridge is disabled in configuration.');

  const endpoint = `${baseUrl}/api/models/predict`;
  const { init, clear } = withTimeoutInit(
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    timeoutMs,
  );

  try {
    const res = await fetch(endpoint, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qlib model prediction failed (${res.status}): ${text}`);
    }
    return (await res.json()) as QlibModelResult;
  } catch (error) {
    throw new Error(
      `Failed to predict Qlib model: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clear();
  }
}

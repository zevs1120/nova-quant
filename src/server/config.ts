import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { AppConfig } from './types.js';

dotenv.config();

const DEFAULT_CONFIG_PATH = process.env.INGEST_CONFIG_PATH || 'config/ingestion.config.json';

function readConfigFile(configPath: string): AppConfig {
  const absolute = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);
  const text = fs.readFileSync(absolute, 'utf-8');
  return JSON.parse(text) as AppConfig;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const config = readConfigFile(DEFAULT_CONFIG_PATH);
  if (process.env.DB_PATH) {
    config.database.path = process.env.DB_PATH;
  } else if (process.env.VITEST_WORKER_ID) {
    config.database.path = path.join(process.cwd(), '.tmp', `nova-quant-test-${process.env.VITEST_WORKER_ID}.db`);
  } else if (process.env.VERCEL === '1') {
    // Vercel serverless functions can only write to the ephemeral /tmp volume.
    config.database.path = '/tmp/nova-quant/quant.db';
  }

  if (process.env.CRYPTO_SYMBOLS) {
    config.markets.CRYPTO.symbols = process.env.CRYPTO_SYMBOLS.split(',').map((x) => x.trim()).filter(Boolean);
  }

  if (process.env.US_SYMBOLS) {
    config.markets.US.symbols = process.env.US_SYMBOLS.split(',').map((x) => x.trim()).filter(Boolean);
  }

  cached = config;
  return config;
}

export function resolveDbPath(): string {
  const config = getConfig();
  const dbPath = config.database.path;
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

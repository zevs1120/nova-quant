import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { runEvidenceEngine } from '../src/server/evidence/engine.js';
import type { AssetClass, Market } from '../src/server/types.js';

function parseMarket(value: string | undefined): Market | undefined {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseAssetClass(value: string | undefined): AssetClass | undefined {
  const upper = String(value || '').trim().toUpperCase();
  if (upper === 'US_STOCK' || upper === 'CRYPTO' || upper === 'OPTIONS') return upper;
  return undefined;
}

function parseArgs(argv: string[]) {
  let userId = 'guest-default';
  let market: Market | undefined;
  let assetClass: AssetClass | undefined;
  let timeframe: string | undefined;
  let maxSignals: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--user' && argv[i + 1]) {
      userId = String(argv[i + 1]).trim() || userId;
      i += 1;
      continue;
    }
    if (arg === '--market' && argv[i + 1]) {
      market = parseMarket(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--assetClass' && argv[i + 1]) {
      assetClass = parseAssetClass(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--timeframe' && argv[i + 1]) {
      timeframe = String(argv[i + 1]).trim() || undefined;
      i += 1;
      continue;
    }
    if (arg === '--maxSignals' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      maxSignals = Number.isFinite(n) ? n : undefined;
      i += 1;
      continue;
    }
  }

  return { userId, market, assetClass, timeframe, maxSignals };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const out = runEvidenceEngine(repo, {
    userId: args.userId,
    market: args.market,
    assetClass: args.assetClass,
    timeframe: args.timeframe,
    maxSignals: args.maxSignals
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...out }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

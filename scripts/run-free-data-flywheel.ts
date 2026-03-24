import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { runFreeDataFlywheel } from '../src/server/jobs/freeData.js';

function parseArgs(argv: string[]) {
  const out = {
    market: 'ALL' as 'US' | 'CRYPTO' | 'ALL',
    userId: 'guest-default',
    refreshNews: true,
    refreshCryptoStructure: true,
    cryptoSymbols: [] as string[],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');

    if (key === 'market' && next)
      out.market = String(next).trim().toUpperCase() as 'US' | 'CRYPTO' | 'ALL';
    if (key === 'user' && next) out.userId = String(next).trim() || out.userId;
    if (key === 'skip-news') out.refreshNews = false;
    if (key === 'skip-crypto-structure') out.refreshCryptoStructure = false;
    if (key === 'crypto-symbols' && next) {
      out.cryptoSymbols = String(next)
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
    }

    if (consumeNext) i += 1;
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const result = await runFreeDataFlywheel({
    repo,
    market: args.market,
    userId: args.userId,
    triggerType: 'manual',
    refreshNews: args.refreshNews,
    refreshCryptoStructure: args.refreshCryptoStructure,
    cryptoSymbols: args.cryptoSymbols,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

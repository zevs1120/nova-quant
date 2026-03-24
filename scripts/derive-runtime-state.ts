import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureQuantData } from '../src/server/quant/service.js';

function parseArgs(argv: string[]): { userId: string; force: boolean } {
  let userId = 'guest-default';
  let force = true;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--user' && argv[i + 1]) {
      userId = String(argv[i + 1]).trim() || userId;
      i += 1;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--no-force') {
      force = false;
    }
  }
  return { userId, force };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);
  const snapshot = ensureQuantData(repo, args.userId, args.force);
  const asOf = new Date(snapshot.asofMs).toISOString();
  const signalCount = snapshot.signals.length;
  const marketStateCount = snapshot.marketState.length;
  const staleCount = Number(
    (snapshot.freshnessSummary as Record<string, unknown>)?.stale_count || 0,
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        user_id: args.userId,
        as_of: asOf,
        source_status: snapshot.sourceStatus,
        signals: signalCount,
        market_state_rows: marketStateCount,
        stale_rows: staleCount,
        coverage: snapshot.coverageSummary,
        freshness: snapshot.freshnessSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

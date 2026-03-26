import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { runAlphaDiscoveryCycle } from '../src/server/alpha_discovery/index.js';

function parseArgs(argv: string[]) {
  const args = {
    userId: 'guest-default',
    triggerType: 'manual' as 'manual' | 'scheduled' | 'shadow',
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [key, inlineValue] = token.slice(2).split('=');
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');
    if (key === 'user' && next) args.userId = String(next).trim() || args.userId;
    if (key === 'trigger' && next) {
      const normalized = String(next).trim().toLowerCase();
      if (normalized === 'scheduled' || normalized === 'shadow') args.triggerType = normalized;
      else args.triggerType = 'manual';
    }
    if (key === 'force') args.force = true;
    if (consumeNext) i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureSchema(db);
  const { repo, flush } = createMirroringMarketRepository(db);
  try {
    const result = await runAlphaDiscoveryCycle({
      repo,
      userId: args.userId,
      triggerType: args.triggerType,
      force: args.force,
    });
    await flush();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await flush();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

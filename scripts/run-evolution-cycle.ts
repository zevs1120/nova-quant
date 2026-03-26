import { pathToFileURL } from 'node:url';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { ensureQuantData } from '../src/server/quant/service.js';
import { runEvolutionCycle } from '../src/server/quant/evolution.js';

export function parseArgs(argv: string[]) {
  const out = {
    userId: 'guest-default',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--user' && argv[i + 1]) {
      out.userId = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

export async function runEvolutionCycleCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const db = getDb();
  ensureSchema(db);
  const { repo, flush } = createMirroringMarketRepository(db);
  try {
    const snapshot = ensureQuantData(repo, args.userId, true);
    const result = await runEvolutionCycle({
      repo,
      userId: args.userId,
      runtimeSnapshot: {
        sourceStatus: snapshot.sourceStatus,
        freshnessSummary: snapshot.freshnessSummary,
        coverageSummary: snapshot.coverageSummary,
      },
    });
    console.log(
      JSON.stringify(
        {
          workflowId: result.workflowId,
          traceId: result.traceId,
          markets: result.markets,
        },
        null,
        2,
      ),
    );
  } finally {
    await flush();
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runEvolutionCycleCli().catch((error) => {
    console.error('[evolution-cycle] fatal', error);
    process.exitCode = 1;
  });
}

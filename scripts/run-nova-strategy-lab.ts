import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { generateGovernedNovaStrategyReply } from '../src/server/nova/strategyLab.js';
import type { Market } from '../src/server/types.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const promptIndex = args.indexOf('--prompt');
  const marketIndex = args.indexOf('--market');
  const localeIndex = args.indexOf('--locale');
  const riskIndex = args.indexOf('--risk-profile');
  const maxIndex = args.indexOf('--max-candidates');
  const userIndex = args.indexOf('--user');

  return {
    prompt: promptIndex >= 0 ? String(args[promptIndex + 1] || '').trim() : '',
    market:
      marketIndex >= 0
        ? (String(args[marketIndex + 1] || '')
            .trim()
            .toUpperCase() as Market)
        : undefined,
    locale: localeIndex >= 0 ? String(args[localeIndex + 1] || '').trim() : 'en',
    riskProfile: riskIndex >= 0 ? String(args[riskIndex + 1] || '').trim() : undefined,
    maxCandidates: maxIndex >= 0 ? Number(args[maxIndex + 1]) : 12,
    userId: userIndex >= 0 ? String(args[userIndex + 1] || '').trim() : null,
  };
}

async function main() {
  const parsed = parseArgs();
  if (!parsed.prompt) {
    throw new Error('Missing required --prompt');
  }
  if (parsed.market && !['US', 'CRYPTO'].includes(parsed.market)) {
    throw new Error('market must be US or CRYPTO');
  }

  const db = getDb();
  ensureSchema(db);
  const { repo, flush } = createMirroringMarketRepository(db);
  try {
    const result = await generateGovernedNovaStrategyReply({
      repo,
      userId: parsed.userId,
      prompt: parsed.prompt,
      locale: parsed.locale,
      market: parsed.market as 'US' | 'CRYPTO' | undefined,
      riskProfile: parsed.riskProfile,
      maxCandidates: Number.isFinite(parsed.maxCandidates) ? parsed.maxCandidates : 12,
    });

    await flush();
    process.stdout.write(`${result.text}\n\n`);
    process.stdout.write(`${JSON.stringify(result.result, null, 2)}\n`);
  } finally {
    await flush();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

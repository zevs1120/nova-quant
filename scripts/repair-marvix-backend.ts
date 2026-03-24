import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { runFreeDataFlywheel } from '../src/server/jobs/freeData.js';
import { buildPrivateMarvixOpsReport } from '../src/server/ops/privateMarvixOps.js';

type RepairArgs = {
  market: 'US' | 'CRYPTO' | 'ALL';
  userId: string;
};

function parseArgs(argv: string[]): RepairArgs {
  const out: RepairArgs = {
    market: 'ALL',
    userId: 'guest-default',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const key = rawKey.trim();
    const next = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined && next && !next.startsWith('--');

    if (key === 'market' && next)
      out.market = String(next).trim().toUpperCase() as RepairArgs['market'];
    if (key === 'user' && next) out.userId = String(next).trim() || out.userId;

    if (consumeNext) i += 1;
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureSchema(db);
  const repo = new MarketRepository(db);

  const freeData = await runFreeDataFlywheel({
    repo,
    market: args.market,
    userId: args.userId,
    triggerType: 'manual',
    refreshNews: true,
    refreshCryptoStructure: true,
    refreshFundamentals: true,
    refreshOptions: true,
  });

  const report = buildPrivateMarvixOpsReport(repo);
  const latestFreeDataWorkflow =
    report.workflows.find((row) => row.workflow_key === 'free_data_flywheel') || null;

  const summary = {
    generated_at: report.generated_at,
    visibility: report.visibility,
    market: args.market,
    free_data_result: freeData,
    latest_free_data_workflow: latestFreeDataWorkflow,
    health: {
      recent_news_factor_count: report.recent_news_factors.length,
      fundamentals_count: report.reference_data.fundamentals.length,
      option_chain_count: report.reference_data.option_chains.length,
    },
    recent_news_factors: report.recent_news_factors.slice(0, 5),
    reference_data: {
      fundamentals: report.reference_data.fundamentals.slice(0, 5),
      option_chains: report.reference_data.option_chains.slice(0, 5),
    },
    active_signal_news_context: report.active_signals.slice(0, 3).map((row) => ({
      signal_id: row.signal_id,
      symbol: row.symbol,
      news_context: row.news_context,
    })),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

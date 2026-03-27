import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { generateNovaProductionStrategyPack } from '../src/server/nova/productionStrategyPack.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const read = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : '';
  };
  return {
    market: read('--market').toUpperCase() || 'ALL',
    symbols: read('--symbols')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
    start: read('--start') || null,
    end: read('--end') || null,
    riskProfile: read('--risk-profile') || 'balanced',
    userId: read('--user') || null,
  };
}

async function main() {
  const parsed = parseArgs();
  if (!['US', 'CRYPTO', 'ALL'].includes(parsed.market)) {
    throw new Error('market must be US, CRYPTO, or ALL');
  }

  const db = getDb();
  ensureSchema(db);
  const { repo, flush } = createMirroringMarketRepository(db);
  try {
    const result = await generateNovaProductionStrategyPack({
      repo,
      userId: parsed.userId,
      market: parsed.market as 'US' | 'CRYPTO' | 'ALL',
      symbols: parsed.symbols,
      start: parsed.start,
      end: parsed.end,
      riskProfile: parsed.riskProfile,
      locale: 'zh-CN',
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(process.cwd(), 'data', 'auto-engine');
    await fs.mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `production_strategy_pack_${stamp}.json`);
    const mdPath = path.join(outDir, `production_strategy_pack_${stamp}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    await fs.writeFile(mdPath, `${result.markdown_report}\n`);

    process.stdout.write(`${result.markdown_report}\n\n`);
    process.stdout.write(`JSON: ${jsonPath}\n`);
    process.stdout.write(`Markdown: ${mdPath}\n`);
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

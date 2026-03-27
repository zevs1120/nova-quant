import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { createMirroringMarketRepository } from '../src/server/db/postgresBusinessMirror.js';
import { runNovaRobustnessTraining } from '../src/server/nova/robustnessTraining.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const read = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : '';
  };
  return {
    market: read('--market').toUpperCase() || 'ALL',
    start: read('--start') || null,
    end: read('--end') || null,
    taskLimit: Number(read('--task-limit') || 9),
    seed: read('--seed') ? Number(read('--seed')) : undefined,
    riskProfiles: read('--risk-profiles')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    userId: read('--user') || null,
    locale: read('--locale') || 'zh-CN',
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
    const result = await runNovaRobustnessTraining({
      repo,
      userId: parsed.userId,
      locale: parsed.locale,
      market: parsed.market as 'US' | 'CRYPTO' | 'ALL',
      start: parsed.start,
      end: parsed.end,
      taskLimit: Number.isFinite(parsed.taskLimit) ? parsed.taskLimit : undefined,
      seed: parsed.seed,
      riskProfiles: parsed.riskProfiles.length
        ? (parsed.riskProfiles as ('conservative' | 'balanced' | 'aggressive')[])
        : undefined,
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(process.cwd(), 'artifacts', 'training', 'robustness', 'manual');
    await fs.mkdir(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `nova_robustness_training_${stamp}.json`);
    const mdPath = path.join(outDir, `nova_robustness_training_${stamp}.md`);
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

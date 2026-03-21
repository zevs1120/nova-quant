import { getDb } from '../src/server/db/database.js';
import { MarketRepository } from '../src/server/db/repository.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { buildPrivateMarvixOpsReport } from '../src/server/ops/privateMarvixOps.js';

const db = getDb();
ensureSchema(db);
const repo = new MarketRepository(db);
const report = buildPrivateMarvixOpsReport(repo);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

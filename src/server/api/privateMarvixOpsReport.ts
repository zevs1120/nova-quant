import { buildPrivateMarvixOpsReport } from '../ops/privateMarvixOps.js';
import { getRuntimeRepo } from '../db/runtimeRepository.js';

/** Loopback-only JSON for `/api/internal/marvix/ops` — kept out of `queries.ts` to trim app cold import graph. */
export function getPrivateMarvixOps() {
  return buildPrivateMarvixOpsReport(getRuntimeRepo());
}

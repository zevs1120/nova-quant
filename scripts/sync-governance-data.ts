import { getConfig } from '../src/server/config.js';
import { getRuntimeRepo } from '../src/server/db/runtimeRepository.js';
import { refreshGovernanceData } from '../src/server/jobs/governanceData.js';

async function main() {
  const cfg = getConfig();
  const repo = getRuntimeRepo();
  const result = await refreshGovernanceData({
    repo,
    market: 'US',
    usSymbols: cfg.markets.US.symbols,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});

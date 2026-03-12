import { runBackfillCli } from '../src/server/jobs/backfill.js';

runBackfillCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

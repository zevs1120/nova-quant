import { runIncrementalCli } from '../src/server/jobs/incremental.js';

runIncrementalCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

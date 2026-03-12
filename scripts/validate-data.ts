import { runValidationCli } from '../src/server/jobs/validate.js';

runValidationCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from 'node:fs';
import path from 'node:path';
import { runReliabilityStressFramework } from '../src/research/reliability/reliabilityStressFramework.js';

function parseArgs(argv = []) {
  const args = { asOf: '2026-03-08T00:00:00.000Z', riskProfile: 'balanced', out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--as-of') args.asOf = argv[i + 1] || args.asOf;
    if (token === '--risk-profile') args.riskProfile = argv[i + 1] || args.riskProfile;
    if (token === '--out') args.out = argv[i + 1] || args.out;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = runReliabilityStressFramework({
    asOf: args.asOf,
    riskProfileKey: args.riskProfile
  });

  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`reliability_report_written=${outPath}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main();

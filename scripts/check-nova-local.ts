import { inspectNovaHealth } from '../src/server/nova/health.js';

function parseArgs() {
  return {
    json: process.argv.slice(2).includes('--json')
  };
}

function printText(report: Awaited<ReturnType<typeof inspectNovaHealth>>) {
  const lines = [
    'Nova Local Health',
    `- Mode: ${report.mode}`,
    `- Endpoint: ${report.endpoint}`,
    `- Memory tier: ${report.memory_tier}`,
    `- Local enabled: ${report.local_only ? 'yes' : 'no'}`,
    `- Reachable: ${report.reachability.ok ? 'yes' : 'no'}`,
    `- Latency: ${report.reachability.latency_ms ?? 'n/a'} ms`,
    `- Available models: ${report.available_models.length ? report.available_models.join(', ') : 'none detected'}`,
    `- Missing models: ${report.missing_models.length ? report.missing_models.join(', ') : 'none'}`
  ];

  if (report.reachability.error) {
    lines.push(`- Error: ${report.reachability.error}`);
  }

  if (report.recommended_commands.pull.length) {
    lines.push('');
    lines.push('Recommended pull commands:');
    for (const command of report.recommended_commands.pull) {
      lines.push(`  ${command}`);
    }
  }

  lines.push('');
  lines.push(`Start daemon: ${report.recommended_commands.start}`);
  lines.push(`Export training data: ${report.recommended_commands.export_training}`);
  lines.push(`Run LoRA training: ${report.recommended_commands.train_lora}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs();
  const report = await inspectNovaHealth();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  printText(report);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});

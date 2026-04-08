import { getRuntimeRepo } from '../src/server/db/runtimeRepository.js';
import type { Market } from '../src/server/types.js';

type HaltImportArgs = {
  market: Market;
  symbol: string;
  date: string;
  action: 'HALT' | 'RESUME';
  reason: string;
  source: string;
  venue?: string;
};

function readFlag(argv: string[], name: string) {
  const direct = argv.find((token) => token.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = argv.findIndex((token) => token === `--${name}`);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) {
    return argv[index + 1];
  }
  return '';
}

function parseArgs(argv: string[]): HaltImportArgs {
  const market = String(readFlag(argv, 'market') || 'US').trim().toUpperCase() as Market;
  const symbol = String(readFlag(argv, 'symbol') || '')
    .trim()
    .toUpperCase();
  const date = String(readFlag(argv, 'date') || '').trim();
  const action = String(readFlag(argv, 'action') || 'HALT')
    .trim()
    .toUpperCase() as 'HALT' | 'RESUME';
  const reason = String(readFlag(argv, 'reason') || `${action} manual import`).trim();
  const source = String(readFlag(argv, 'source') || 'MANUAL_TRADING_HALT_IMPORT').trim();
  const venue = String(readFlag(argv, 'venue') || 'MANUAL').trim();

  if (!symbol) {
    throw new Error('Missing required --symbol');
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Missing or invalid --date (expected YYYY-MM-DD)');
  }
  if (market !== 'US' && market !== 'CRYPTO') {
    throw new Error('Unsupported --market, expected US or CRYPTO');
  }
  if (action !== 'HALT' && action !== 'RESUME') {
    throw new Error('Unsupported --action, expected HALT or RESUME');
  }

  return { market, symbol, date, action, reason, source, venue };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = getRuntimeRepo();
  const asset = repo.upsertAsset({
    market: args.market,
    symbol: args.symbol,
    venue: args.venue || 'MANUAL',
    quote: args.market === 'CRYPTO' ? 'USDT' : 'USD',
    status: 'ACTIVE',
  });
  const effectiveTs = Date.parse(`${args.date}T00:00:00.000Z`);

  repo.upsertCorporateAction({
    assetId: asset.asset_id,
    effectiveTs,
    actionType: args.action,
    source: args.source,
    notes: args.reason,
  });

  if (args.action === 'HALT') {
    repo.upsertTradingCalendarException({
      market: args.market,
      assetId: asset.asset_id,
      dayKey: args.date,
      status: 'HALTED',
      reason: args.reason,
      source: args.source,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        market: args.market,
        symbol: args.symbol,
        date: args.date,
        action: args.action,
        source: args.source,
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

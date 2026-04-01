import { checkQlibHealth, fetchQlibFactors, syncQlibData } from '../src/server/nova/qlibClient.js';
import { enrichWithQlibFeatures } from '../src/research/core/featureSignalLayer.js';

async function run() {
  console.log('1. Checking Qlib Bridge Health...');
  const isHealthy = await checkQlibHealth();
  console.log(` Health: ${isHealthy ? 'OK' : 'DOWN'}`);

  if (!isHealthy) {
    console.error('Qlib Bridge is not running or disabled. Start it first!');
    process.exit(1);
  }

  console.log('\n2. Testing ETL Sync...');
  try {
    const syncRes = await syncQlibData({ force: false, symbols: ['BTCUSDT'] });
    console.log(` Sync Result: ${JSON.stringify(syncRes)}`);
  } catch (err) {
    console.warn(
      ` Sync Warning/Error (Expected if DB empty): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log('\n3. Testing Enrichment Wrapper...');
  const mockOpportunities = [
    { opportunity_id: 'OPP-1', asset: 'BTCUSDT', evidence_fields: {} },
    { opportunity_id: 'OPP-2', asset: 'ETHUSDT', evidence_fields: {} },
  ];

  const enriched = await enrichWithQlibFeatures(mockOpportunities, fetchQlibFactors);
  console.log(' Enriched Opportunities:', JSON.stringify(enriched, null, 2));
}

run().catch(console.error);

import { describe, expect, it } from 'vitest';
import { createBrokerAdapter } from '../src/server/connect/adapters.js';
import { RUNTIME_STATUS, withComponentStatus } from '../src/server/runtimeStatus.js';

describe('runtime status consistency', () => {
  it('does not expose misleading DB_BACKED label when overall status is insufficient', () => {
    const status = withComponentStatus({
      overallDataStatus: RUNTIME_STATUS.INSUFFICIENT_DATA,
      componentSourceStatus: RUNTIME_STATUS.DB_BACKED,
    });
    expect(status.source_status).toBe(RUNTIME_STATUS.DB_BACKED);
    expect(status.data_status).toBe(RUNTIME_STATUS.INSUFFICIENT_DATA);
    expect(status.source_label).toBe(RUNTIME_STATUS.INSUFFICIENT_DATA);
  });

  it('keeps MODEL_DERIVED distinct from DB_BACKED provenance', () => {
    const status = withComponentStatus({
      overallDataStatus: RUNTIME_STATUS.MODEL_DERIVED,
      componentSourceStatus: RUNTIME_STATUS.DB_BACKED,
    });
    expect(status.source_status).toBe(RUNTIME_STATUS.DB_BACKED);
    expect(status.data_status).toBe(RUNTIME_STATUS.MODEL_DERIVED);
    expect(status.source_label).toBe(RUNTIME_STATUS.MODEL_DERIVED);
  });

  it('keeps connector credential failures separate from runtime data insufficiency', async () => {
    process.env.ALPACA_API_KEY = '';
    process.env.ALPACA_API_SECRET = '';
    const adapter = createBrokerAdapter('ALPACA');
    const snapshot = await adapter.fetchSnapshot();
    expect(snapshot.source_status).toBe(RUNTIME_STATUS.DISCONNECTED);
    expect(snapshot.data_status).toBe(RUNTIME_STATUS.NO_CREDENTIALS);
    expect(snapshot.source_label).toBe(RUNTIME_STATUS.NO_CREDENTIALS);
  });
});

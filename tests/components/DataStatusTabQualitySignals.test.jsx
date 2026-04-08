import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DataStatusTab from '../../src/components/DataStatusTab';

vi.mock('../../src/hooks/useControlPlaneStatus', () => ({
  useControlPlaneStatus: () => ({
    controlPlane: null,
    loading: false,
  }),
}));

describe('DataStatusTab quality signals', () => {
  it('surfaces adjustment drift and corporate action conflicts in the admin panel', () => {
    render(
      <DataStatusTab
        data={{
          config: {
            runtime: {
              source_status: 'DB_BACKED',
              freshness_summary: {
                stale_count: 0,
                rows: [
                  {
                    market: 'US',
                    symbol: 'TSLA',
                    status: 'DB_BACKED',
                    age_hours: 2,
                    quality_state_status: 'SUSPECT',
                    quality_state_reason: 'PROVIDER_ADJUSTMENT_DRIFT',
                  },
                  {
                    market: 'US',
                    symbol: 'AAPL',
                    status: 'DB_BACKED',
                    age_hours: 4,
                    quality_state_status: 'SUSPECT',
                    quality_state_reason: 'CORPORATE_ACTION_SOURCE_CONFLICT',
                  },
                ],
              },
              coverage_summary: {
                assets_checked: 2,
                assets_with_bars: 2,
                generated_signals: 1,
              },
            },
          },
        }}
        fetchJson={vi.fn()}
        effectiveUserId="admin-user"
      />,
    );

    expect(screen.getByText('Adjustment Drift')).toBeInTheDocument();
    expect(screen.getByText('Corp Action Conflicts')).toBeInTheDocument();
    expect(screen.getByText('PROVIDER_ADJUSTMENT_DRIFT')).toBeInTheDocument();
    expect(screen.getByText('CORPORATE_ACTION_SOURCE_CONFLICT')).toBeInTheDocument();
  });

  it('loads symbol drill-down detail when a row is inspected', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      data: {
        detail: {
          symbol: 'TSLA',
          anomaly_total_count: 3,
          quality_state_metrics: {
            adjustment_drift: {
              overlap_count: 24,
            },
          },
          recent_governance_runs: [
            {
              id: 'run-1',
              status: 'SUCCEEDED',
              completed_at: '2026-04-09T12:00:00.000Z',
              governance_summary: {
                rows_upserted: 2,
                mismatch_symbols: 1,
                calendar_rows_upserted: 16,
              },
            },
          ],
          timeline: [
            {
              ts: Date.UTC(2026, 3, 8),
              type: 'SPLIT',
              label: '3-for-1 split',
              source: 'YAHOO_CHART_SYNC',
            },
          ],
        },
      },
    });

    render(
      <DataStatusTab
        data={{
          config: {
            runtime: {
              source_status: 'DB_BACKED',
              freshness_summary: {
                stale_count: 0,
                rows: [
                  {
                    market: 'US',
                    symbol: 'TSLA',
                    status: 'DB_BACKED',
                    age_hours: 2,
                    quality_state_status: 'SUSPECT',
                    quality_state_reason: 'PROVIDER_ADJUSTMENT_DRIFT',
                  },
                ],
              },
              coverage_summary: {
                assets_checked: 1,
                assets_with_bars: 1,
                generated_signals: 0,
              },
            },
          },
        }}
        fetchJson={fetchJson}
        effectiveUserId="admin-user"
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Inspect' }).at(-1));

    expect(fetchJson).toHaveBeenCalledWith('/api/admin/data-quality?symbol=TSLA&market=US');
    expect(await screen.findByText('Recent Governance Runs')).toBeInTheDocument();
    expect(await screen.findByText('Timeline')).toBeInTheDocument();
    expect(await screen.findByText('3-for-1 split')).toBeInTheDocument();
  });
});

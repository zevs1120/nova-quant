import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../src/server/api/app.js';

describe('engagement api', () => {
  it('returns a grounded engagement snapshot and persists ritual state', async () => {
    const app = createApiApp();
    const userId = `engagement-api-${Date.now()}`;

    const stateRes = await request(app).post('/api/engagement/state').send({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 9,
      holdings: [
        { symbol: 'AAPL', market: 'US', asset_class: 'US_STOCK', weight_pct: 14, sector: 'Technology' },
        { symbol: 'QQQ', market: 'US', asset_class: 'US_STOCK', weight_pct: 18, sector: 'ETF' }
      ]
    });

    expect(stateRes.status).toBe(200);
    expect(stateRes.body).toHaveProperty('daily_check_state');
    expect(stateRes.body).toHaveProperty('habit_state');
    expect(stateRes.body).toHaveProperty('widget_summary');
    expect(stateRes.body).toHaveProperty('notification_center');
    expect(stateRes.body).toHaveProperty('decision_snapshot_id');

    const morningRes = await request(app).post('/api/engagement/morning-check').send({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 9
    });

    expect(morningRes.status).toBe(200);
    expect(morningRes.body.daily_check_state.status).toBe('COMPLETED');
    expect(morningRes.body.habit_state.checkedToday).toBe(true);

    const widgetRes = await request(app).get('/api/widgets/summary').query({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 9
    });

    expect(widgetRes.status).toBe(200);
    expect(widgetRes.body).toHaveProperty('widget_summary');
    expect(widgetRes.body.widget_summary).toHaveProperty('state_widget');
    expect(widgetRes.body.widget_summary.state_widget.spark).toBeTruthy();

    const prefsRes = await request(app).post('/api/notification-preferences').send({
      userId,
      frequency: 'LOW',
      protective_enabled: false
    });

    expect(prefsRes.status).toBe(200);
    expect(prefsRes.body.frequency).toBe('LOW');
    expect(prefsRes.body.protective_enabled).toBe(0);

    const previewRes = await request(app).get('/api/notifications/preview').query({
      userId,
      market: 'US',
      assetClass: 'US_STOCK',
      localDate: '2026-03-14',
      localHour: 19
    });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.notification_center).toHaveProperty('notifications');
    expect(Array.isArray(previewRes.body.notification_center.notifications)).toBe(true);
    expect(previewRes.body.notification_center.notifications[0]).toHaveProperty('tone');
  });
});

import { describe, expect, it } from 'vitest';
import { parseBinanceKlineRow } from '../src/server/ingestion/binancePublic.js';
import { parseStooqRecord } from '../src/server/ingestion/stooq.js';
import {
  inspectBarQuality,
  normalizeBars,
  sanitizeBar,
} from '../src/server/ingestion/normalize.js';

describe('parsers', () => {
  it('parses Binance kline row', () => {
    const row = [
      '1700000000000',
      '42000.1',
      '42100.2',
      '41950.3',
      '42080.8',
      '1234.56',
      '1700000299999',
    ];

    const bar = parseBinanceKlineRow(row);
    expect(bar).not.toBeNull();
    expect(bar?.ts_open).toBe(1700000000000);
    expect(bar?.close).toBe('42080.8');
  });

  it('parses Stooq record with header keys', () => {
    const record = {
      DATE: '20260301',
      TIME: '143000',
      OPEN: '200.1',
      HIGH: '201.2',
      LOW: '199.5',
      CLOSE: '200.9',
      VOLUME: '1000000',
    } as unknown as Record<string, string>;

    const bar = parseStooqRecord(record);
    expect(bar).not.toBeNull();
    expect(bar?.open).toBe('200.1');
    expect(bar?.volume).toBe('1000000');
  });

  it('normalizes and deduplicates bars', () => {
    const bars = normalizeBars([
      { ts_open: 10, open: '1', high: '2', low: '0.5', close: '1.1', volume: '100' },
      { ts_open: 10, open: '1.2', high: '2.2', low: '0.4', close: '1.3', volume: '120' },
      { ts_open: 5, open: '0.9', high: '1.5', low: '0.7', close: '1.0', volume: '90' },
    ]);

    expect(bars).toHaveLength(2);
    expect(bars[0].ts_open).toBe(5);
    expect(bars[1].open).toBe('1.2');
  });

  it('sanitizes OHLC envelopes and clamps negative volume', () => {
    const bar = sanitizeBar({
      ts_open: 20,
      open: '100',
      high: '95',
      low: '105',
      close: '102',
      volume: '-30',
    });

    expect(bar).toEqual({
      ts_open: 20,
      open: '100',
      high: '105',
      low: '95',
      close: '102',
      volume: '0',
    });
  });

  it('drops bars with invalid timestamps or non-positive prices', () => {
    const bars = normalizeBars([
      { ts_open: 0, open: '1', high: '2', low: '1', close: '1.5', volume: '10' },
      { ts_open: 10, open: '0', high: '2', low: '1', close: '1.5', volume: '10' },
      { ts_open: 20, open: '1', high: '2', low: '1', close: '1.5', volume: '10' },
      { ts_open: 30, open: '1', high: '2', low: '1', close: '-1', volume: '10' },
      { ts_open: 40, open: 'bad', high: '2', low: '1', close: '1.5', volume: '10' },
    ]);

    expect(bars).toEqual([
      { ts_open: 20, open: '1', high: '2', low: '1', close: '1.5', volume: '10' },
    ]);
  });

  it('classifies envelope and zero-volume anomalies without dropping the bar', () => {
    const inspection = inspectBarQuality({
      ts_open: 50,
      open: '10',
      high: '8',
      low: '12',
      close: '11',
      volume: '0',
    });

    expect(inspection.invalidPrice).toBe(false);
    expect(inspection.envelopeAdjusted).toBe(true);
    expect(inspection.zeroVolume).toBe(true);
    expect(inspection.sanitized).toEqual({
      ts_open: 50,
      open: '10',
      high: '12',
      low: '8',
      close: '11',
      volume: '0',
    });
  });
});

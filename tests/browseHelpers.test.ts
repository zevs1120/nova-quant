import { describe, it, expect } from 'vitest';

function compactMetricText(value: any, locale: string = 'en'): string {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const formatNumber = (val: number, dec: number): string =>
    val.toLocaleString(locale, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });

  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 1)}K`;
  return formatNumber(value, 2);
}

function pulseSummary(value: any, isZh: boolean): string {
  if (!Number.isFinite(value))
    return isZh ? '等待新报价刷新。' : 'Waiting for the next live refresh.';
  if (value >= 0.03)
    return isZh
      ? '动能明显偏强，适合继续跟踪成交与新闻催化。'
      : 'Momentum is strong and worth pairing with flow and news catalysts.';
  if (value <= -0.03)
    return isZh
      ? '波动偏大，先看是否进入事件驱动区间。'
      : 'Volatility is elevated; check whether this is sliding into event-driven territory.';
  return isZh ? '价格暂时横摆' : 'Price is mostly flat';
}

describe('BrowseTab Logic Helpers', () => {
  describe('compactMetricText', () => {
    it('formats Billions correctly', () => {
      expect(compactMetricText(1_500_000_000)).toBe('1.50B');
    });
    it('formats Millions correctly', () => {
      expect(compactMetricText(2_750_000)).toBe('2.75M');
    });
    it('returns -- for non-finite values', () => {
      expect(compactMetricText(NaN)).toBe('--');
    });
  });

  describe('pulseSummary', () => {
    it('returns strong momentum copy for > 3% change', () => {
      expect(pulseSummary(0.04, true)).toContain('动能明显偏强');
      expect(pulseSummary(0.04, false)).toContain('Momentum is strong');
    });
    it('returns volatility warning for < -3% change', () => {
      expect(pulseSummary(-0.05, true)).toContain('波动偏大');
    });
    it('returns flat copy for small changes', () => {
      expect(pulseSummary(0.01, true)).toContain('价格暂时横摆');
    });
  });
});

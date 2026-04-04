import { describe, it, expect } from 'vitest';

// 模拟 TodayTab 内部的排名逻辑
function rankSignal(signal: any, now: Date = new Date()): number {
  const confidence = Number(signal?.confidence || 0);
  const score = Number(signal?.score || 0);
  const actionableBonus = signal?.direction && signal?.direction !== 'WAIT' ? 18 : -14;
  return score + confidence * 100 * 0.25 + actionableBonus;
}

function suggestionSubtitle(bestSignal: any, locale: string): string {
  if (!bestSignal) {
    return locale === 'zh' ? '暂时没有足够干净的动作' : 'No clean setup yet.';
  }
  if (bestSignal.direction === 'SHORT') {
    return locale === 'zh' ? '风险仍偏高' : 'Risk is still elevated.';
  }
  return locale === 'zh' ? '今天可以看动作' : 'Selective action is workable.';
}

describe('TodayTab Core Logic', () => {
  describe('rankSignal', () => {
    it('gives bonus to actionable signals', () => {
      const actionable = {
        symbol: 'AAPL',
        direction: 'LONG',
        score: 50,
        confidence: 0.8,
      };
      const waiting = {
        symbol: 'TSLA',
        direction: 'WAIT',
        score: 50,
        confidence: 0.8,
      };
      expect(rankSignal(actionable)).toBeGreaterThan(rankSignal(waiting));
    });

    it('ranks higher confidence signals over lower ones', () => {
      const high = {
        symbol: 'AAPL',
        direction: 'LONG',
        score: 50,
        confidence: 0.9,
      };
      const low = {
        symbol: 'AAPL',
        direction: 'LONG',
        score: 50,
        confidence: 0.7,
      };
      expect(rankSignal(high)).toBeGreaterThan(rankSignal(low));
    });
  });

  describe('suggestionSubtitle', () => {
    it('returns cautionary text for SHORT signals', () => {
      const short = { direction: 'SHORT' };
      expect(suggestionSubtitle(short, 'zh')).toContain('风险仍偏高');
    });

    it('returns empty state text when no signal', () => {
      expect(suggestionSubtitle(null, 'en')).toContain('No clean setup');
    });
  });
});

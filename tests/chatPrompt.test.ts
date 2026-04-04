import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '../src/server/chat/prompts.js';

describe('chat prompts', () => {
  it('enforces checklist structure and disclaimer requirement', () => {
    const prompt = buildSystemPrompt('general-coach', false);
    expect(prompt.toLowerCase()).toContain('what to do next');
    expect(prompt).toContain('risk boundary');
    expect(prompt).toContain('position size idea');
    expect(prompt).toContain('Common failure modes / when NOT to trade');
    expect(prompt).toContain('translate an action card');
    expect(prompt).toContain('smart friend who does not want jargon');
    expect(prompt).toContain('Assume the reader may be new to trading');
    expect(prompt).toContain('Use short sentences and everyday words');
    expect(prompt).toContain('Never expose raw field names');
    expect(prompt).toContain('educational, not financial advice');
  });

  it('requires honest downgrade guidance when exact signal data is missing', () => {
    const prompt = buildSystemPrompt('context-aware', false);
    expect(prompt).toContain('If exact signal detail is missing, say so clearly');
  });

  it('upgrades instructions for research assistant mode', () => {
    const prompt = buildSystemPrompt('research-assistant', false);
    expect(prompt).toContain('Research Assistant');
    expect(prompt).toContain('whether it is worthy of backtest / replay / paper');
    expect(prompt).toContain('factor-level realized data is unavailable');
  });

  it('switches prompt protocol to Chinese when reply language is zh', () => {
    const prompt = buildSystemPrompt('general-coach', false, 'zh');
    expect(prompt).toContain('你是 Nova Quant 的 Nova Assistant');
    expect(prompt).toContain('把 action card 翻译成人能立刻听懂的话');
    expect(prompt).toContain('默认把读者当成第一次接触交易的人');
    expect(prompt).toContain('任何字段名、数据库键名、内部枚举值都不要原样吐给用户');
    expect(prompt).toContain('结论:');
    expect(prompt).toContain('行动:');
    expect(prompt).toContain('仅供教育参考，不构成投资建议');
  });

  it('adds an action-card translation brief to the grounded user prompt', () => {
    const prompt = buildUserPrompt({
      userMessage: 'Explain this card',
      mode: 'context-aware',
      history: [],
      context: {
        locale: 'en',
        page: 'today',
        symbol: 'NVDA',
      },
      contextBundle: {
        requestedSymbol: 'NVDA',
        requestedMarket: 'US',
        requestedAssetClass: 'US_STOCK',
        signalCards: [],
        signalDetail: {
          symbol: 'NVDA',
          direction: 'LONG',
          status: 'NEW',
          confidence: 0.74,
          entry_zone: { low: 118.4, high: 120.1 },
          invalidation_level: 115.6,
          position_advice: { position_pct: 8 },
          expires_at: '2026-04-03T14:37:00.000Z',
        },
        marketTemperature: null,
        riskProfile: null,
        performanceSummary: null,
        deterministicGuide: null,
        selectedEvidence: [],
        statusSummary: [],
        sourceTransparency: {
          signal_data_status: 'DB_BACKED',
          market_state_status: 'DB_BACKED',
          performance_source: 'none',
          performance_status: 'unavailable',
        },
        researchContext: {
          research_mode: false,
          selected_tools: [],
          tool_results: [],
        },
        hasExactSignalData: true,
      },
    });

    expect(prompt).toContain('ACTION CARD TRANSLATION BRIEF');
    expect(prompt).toContain('only consider buying NVDA if price trades inside 118.4 to 120.1');
    expect(prompt).toContain('invalid if price breaks 115.6');
    expect(prompt).toContain('suggested starter size 8%');
  });
});

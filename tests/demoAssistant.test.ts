import { describe, expect, it } from 'vitest';
import { buildInvestorDemoEnvironment } from '../src/demo/investorDemo.js';
import { buildDemoAssistantReply } from '../src/demo/demoAssistant.js';

describe('demoAssistant', () => {
  it('returns a structured offline answer for the primary signal question', () => {
    const state = buildInvestorDemoEnvironment('US_STOCK');
    const reply = buildDemoAssistantReply('Why this signal?', state, { page: 'today' });

    expect(reply).toContain('VERDICT:');
    expect(reply).toContain('PLAN:');
    expect(reply).toContain('WHY:');
    expect(reply).toContain('RISK:');
    expect(reply).toContain('EVIDENCE:');
    expect(reply).toContain('AAPL');
    expect(reply).toContain('offline investor walkthrough');
  });

  it('explains holdings in demo mode without requiring network context', () => {
    const state = {
      ...buildInvestorDemoEnvironment('US_STOCK'),
      user_context: {
        holdings_review: {
          rows: [{ symbol: 'AAPL', system_status: 'supported' }]
        }
      }
    };
    const reply = buildDemoAssistantReply('What is my biggest holdings risk?', state, { page: 'holdings' });

    expect(reply).toContain('VERDICT:');
    expect(reply).toContain('AAPL');
    expect(reply).toContain('demo');
  });

  it('returns Chinese structured sections when the question is Chinese', () => {
    const state = buildInvestorDemoEnvironment('US_STOCK');
    const reply = buildDemoAssistantReply('我今天该怎么做？', state, { page: 'today', locale: 'zh' });

    expect(reply).toContain('结论:');
    expect(reply).toContain('行动:');
    expect(reply).toContain('风险:');
    expect(reply).toContain('仅供教育参考，不构成投资建议');
  });
});

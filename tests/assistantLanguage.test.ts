import { describe, expect, it } from 'vitest';
import {
  appendAssistantDisclaimer,
  detectMessageLanguage,
  formatStructuredAssistantReply,
  parseAssistantSectionHeading
} from '../src/utils/assistantLanguage.js';

describe('assistantLanguage', () => {
  it('detects Chinese user questions', () => {
    expect(detectMessageLanguage('我现在应该进场吗？', 'en')).toBe('zh');
    expect(detectMessageLanguage('Should I enter now?', 'zh')).toBe('zh');
    expect(detectMessageLanguage('Should I enter now?', 'en')).toBe('en');
  });

  it('formats Chinese structured replies with Chinese disclaimer', () => {
    const reply = formatStructuredAssistantReply({
      language: 'zh',
      verdict: '今天先等。',
      plan: ['先看风险。'],
      why: ['当前优势不够干净。'],
      risk: ['不要硬做。'],
      evidence: ['market regime WAIT']
    });

    expect(reply).toContain('结论: 今天先等。');
    expect(reply).toContain('行动:');
    expect(reply).toContain('仅供教育参考，不构成投资建议');
  });

  it('parses Chinese section headers', () => {
    expect(parseAssistantSectionHeading('结论：先等等')).toEqual({ key: 'VERDICT', rest: '先等等' });
    expect(parseAssistantSectionHeading('证据: market regime WAIT')).toEqual({
      key: 'EVIDENCE',
      rest: 'market regime WAIT'
    });
  });

  it('replaces old disclaimer when switching languages', () => {
    expect(appendAssistantDisclaimer('Answer body\n\neducational, not financial advice', 'zh')).toBe(
      'Answer body\n\n仅供教育参考，不构成投资建议'
    );
  });
});

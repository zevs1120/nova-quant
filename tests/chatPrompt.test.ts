import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/server/chat/prompts.js';

describe('chat prompts', () => {
  it('enforces checklist structure and disclaimer requirement', () => {
    const prompt = buildSystemPrompt('general-coach', false);
    expect(prompt.toLowerCase()).toContain('what to do next');
    expect(prompt).toContain('risk boundary');
    expect(prompt).toContain('position size idea');
    expect(prompt).toContain('Common failure modes / when NOT to trade');
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
    expect(prompt).toContain('结论:');
    expect(prompt).toContain('行动:');
    expect(prompt).toContain('仅供教育参考，不构成投资建议');
  });
});

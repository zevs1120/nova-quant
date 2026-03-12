import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/server/chat/prompts.js';

describe('chat prompts', () => {
  it('enforces checklist structure and disclaimer requirement', () => {
    const prompt = buildSystemPrompt('general-coach', false);
    expect(prompt).toContain('What it means');
    expect(prompt).toContain('Risk boundary');
    expect(prompt).toContain('Position sizing idea');
    expect(prompt).toContain('Common failure modes / when NOT to trade');
    expect(prompt).toContain('educational, not financial advice');
  });

  it('requires exact sentence when context is requested without exact data', () => {
    const prompt = buildSystemPrompt('context-aware', false);
    expect(prompt).toContain('I don’t have your exact signal data yet, so here’s a general guideline.');
  });
});

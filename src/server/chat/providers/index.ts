import type { ProviderAdapter } from '../types.js';
import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
import { isLocalNovaEnabled } from '../../ai/llmOps.js';

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'ollama';

export function getProviderOrder(): ProviderName[] {
  return ['ollama'];
}

export function createProvider(name: ProviderName): ProviderAdapter {
  if (name === 'groq') return new GroqProvider();
  if (name === 'gemini') return new GeminiProvider();
  if (name === 'openai') return new OpenAIProvider();
  return new OllamaProvider();
}

export function isProviderConfigured(name: ProviderName): boolean {
  return name === 'ollama' && isLocalNovaEnabled();
}

import type { ProviderAdapter } from '../types.js';
import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'ollama';

export function getProviderOrder(): ProviderName[] {
  const preferred = (process.env.AI_PROVIDER || process.env.CHAT_PROVIDER || 'groq').toLowerCase() as ProviderName;
  if (preferred === 'gemini') return ['gemini', 'groq', 'openai', 'ollama'];
  if (preferred === 'openai') return ['openai', 'groq', 'gemini', 'ollama'];
  if (preferred === 'ollama') return ['ollama', 'groq', 'gemini', 'openai'];
  return ['groq', 'gemini', 'openai', 'ollama'];
}

export function createProvider(name: ProviderName): ProviderAdapter {
  if (name === 'groq') return new GroqProvider();
  if (name === 'gemini') return new GeminiProvider();
  if (name === 'openai') return new OpenAIProvider();
  return new OllamaProvider();
}

export function isProviderConfigured(name: ProviderName): boolean {
  if (name === 'groq') return Boolean(process.env.GROQ_API_KEY);
  if (name === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (name === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
}

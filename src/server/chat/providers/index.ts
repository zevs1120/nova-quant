import type { ProviderAdapter } from '../types.js';
import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';
import { getNovaRuntimeMode, isCloudNovaEnabled, isLocalNovaEnabled } from '../../ai/llmOps.js';

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'ollama';

export function getProviderOrder(): ProviderName[] {
  const ordered: ProviderName[] = [];
  const mode = getNovaRuntimeMode();

  // Explanation/chat prefers Gemini first so the public assistant layer stays aligned
  // with the EC2 architecture where Marvix handles decision logic and Gemini handles explanation.
  if (Boolean(String(process.env.GEMINI_API_KEY || '').trim())) ordered.push('gemini');
  if (Boolean(String(process.env.GROQ_API_KEY || '').trim())) ordered.push('groq');
  if (isLocalNovaEnabled()) ordered.push('ollama');
  if (mode === 'cloud-openai-compatible' || isCloudNovaEnabled()) ordered.push('openai');
  return ordered;
}

export function createProvider(name: ProviderName): ProviderAdapter {
  if (name === 'groq') return new GroqProvider();
  if (name === 'gemini') return new GeminiProvider();
  if (name === 'openai') return new OpenAIProvider();
  return new OllamaProvider();
}

export function isProviderConfigured(name: ProviderName): boolean {
  if (name === 'ollama') return isLocalNovaEnabled();
  if (name === 'openai') return isCloudNovaEnabled();
  if (name === 'groq') return Boolean(String(process.env.GROQ_API_KEY || '').trim());
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

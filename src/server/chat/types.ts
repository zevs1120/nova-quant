import type { AssetClass, Market } from '../types.js';

export interface ChatContextInput {
  signalId?: string;
  symbol?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
}

export interface ChatRequestInput {
  userId: string;
  message: string;
  context?: ChatContextInput;
}

export interface ToolContextBundle {
  signalCards: unknown[];
  signalDetail: Record<string, unknown> | null;
  marketTemperature: Record<string, unknown> | null;
  riskProfile: Record<string, unknown> | null;
  performanceSummary: Record<string, unknown> | null;
  sourceTransparency: {
    signal_data_status: string;
    market_state_status: string;
    performance_source: string;
    performance_status: string;
  };
  hasExactSignalData: boolean;
}

export type ChatMode = 'general-coach' | 'context-aware';

export type StreamEvent =
  | { type: 'meta'; mode: ChatMode; provider: string }
  | { type: 'chunk'; delta: string }
  | { type: 'done'; mode: ChatMode; provider: string }
  | { type: 'error'; error: string };

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderAdapter {
  readonly name: 'groq' | 'gemini' | 'openai' | 'ollama';
  stream(req: ProviderRequest): AsyncGenerator<string>;
}

export interface ChatAuditRecord {
  userId: string;
  mode: ChatMode;
  provider: string;
  message: string;
  contextJson: string;
  status: 'ok' | 'error' | 'rate_limited';
  error?: string;
  responsePreview?: string;
  durationMs: number;
}

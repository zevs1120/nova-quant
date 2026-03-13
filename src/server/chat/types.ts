import type { AssetClass, Market } from '../types.js';

export interface ChatContextInput {
  signalId?: string;
  symbol?: string;
  market?: Market;
  assetClass?: AssetClass;
  timeframe?: string;
  page?: 'today' | 'ai' | 'holdings' | 'more' | 'signal-detail' | 'unknown';
  riskProfileKey?: string;
  uiMode?: string;
}

export interface ChatRequestInput {
  userId: string;
  message: string;
  threadId?: string;
  context?: ChatContextInput;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAtMs: number;
}

export interface ToolContextBundle {
  signalCards: unknown[];
  signalDetail: Record<string, unknown> | null;
  marketTemperature: Record<string, unknown> | null;
  riskProfile: Record<string, unknown> | null;
  performanceSummary: Record<string, unknown> | null;
  deterministicGuide: {
    intent: string;
    ticker: string | null;
    text: string;
  } | null;
  selectedEvidence: string[];
  statusSummary: string[];
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
  | { type: 'meta'; mode: ChatMode; provider: string; threadId: string }
  | { type: 'chunk'; delta: string }
  | { type: 'done'; mode: ChatMode; provider: string; threadId: string }
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
  threadId?: string;
  message: string;
  contextJson: string;
  status: 'ok' | 'error' | 'rate_limited';
  error?: string;
  responsePreview?: string;
  durationMs: number;
}

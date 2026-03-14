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
  decisionSummary?: {
    today_call?: string;
    risk_posture?: string;
    top_action_id?: string | null;
    top_action_symbol?: string | null;
    top_action_label?: string | null;
    source_status?: string;
    data_status?: string;
  };
  holdingsSummary?: {
    holdings_count?: number;
    total_weight_pct?: number;
    aligned_weight_pct?: number;
    unsupported_weight_pct?: number;
    top1_pct?: number;
    risk_level?: string;
    recommendation?: string;
  };
  engagementSummary?: {
    morning_check_status?: string | null;
    morning_check_label?: string | null;
    morning_check_arrival?: string | null;
    morning_check_ritual?: string | null;
    wrap_up_ready?: boolean;
    wrap_up_completed?: boolean;
    wrap_up_line?: string | null;
    discipline_score?: number | null;
    behavior_quality?: string | null;
    recommendation_change?: string | null;
    ui_tone?: string | null;
  };
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
  researchContext: {
    research_mode: boolean;
    selected_tools: string[];
    tool_results: Array<{
      tool: string;
      source_status: string;
      data_status: string;
      payload: unknown;
    }>;
  };
  hasExactSignalData: boolean;
}

export type ChatMode = 'general-coach' | 'context-aware' | 'research-assistant';

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

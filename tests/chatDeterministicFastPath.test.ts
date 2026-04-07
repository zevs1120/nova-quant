import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providerStream = vi.fn(async function* () {
  yield 'provider reply';
});

const repoState = {
  thread: null as any,
  messages: [] as any[],
  upsertThreadCalls: [] as any[],
};

vi.mock('../src/server/chat/providers/index.js', () => ({
  getProviderOrder: () => ['openai'],
  isProviderConfigured: () => true,
  createProvider: () => ({
    name: 'openai',
    stream: providerStream,
  }),
}));

vi.mock('../src/server/chat/tools.js', () => ({
  buildContextBundle: vi.fn(async () => ({
    deterministicGuide: null,
    statusSummary: ['runtime ready'],
    selectedEvidence: ['top signal ready'],
    signalCards: [{ symbol: 'SPY', direction: 'LONG', status: 'NEW', confidence: 0.82 }],
    signalDetail: {
      symbol: 'SPY',
      direction: 'LONG',
      status: 'NEW',
      confidence: 0.82,
      entry_zone: { low: 500, high: 505 },
    },
    marketTemperature: {
      regime_id: 'trend',
      temperature_percentile: 58,
    },
    requestedSymbol: 'SPY',
    hasExactSignalData: true,
    riskProfile: {
      profile_key: 'balanced',
    },
  })),
}));

vi.mock('../src/server/db/runtimeRepository.js', () => ({
  getRuntimeRepo: () => ({
    getChatThread: vi.fn((threadId: string, userId: string) =>
      repoState.thread?.id === threadId && repoState.thread?.user_id === userId
        ? repoState.thread
        : null,
    ),
    getLatestChatThread: vi.fn(() => repoState.thread),
    upsertChatThread: vi.fn((thread: any) => {
      repoState.thread = thread;
      repoState.upsertThreadCalls.push(thread);
    }),
    appendChatMessage: vi.fn((message: any) => {
      repoState.messages.push({
        id: repoState.messages.length + 1,
        ...message,
      });
      return repoState.messages.length;
    }),
    listChatMessages: vi.fn((threadId: string, limit: number) =>
      repoState.messages.filter((row) => row.thread_id === threadId).slice(-limit),
    ),
  }),
}));

describe('chat deterministic fast path', () => {
  beforeEach(() => {
    repoState.thread = null;
    repoState.messages = [];
    repoState.upsertThreadCalls = [];
    providerStream.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses deterministic grounded reply for quick decision questions even when providers are configured', async () => {
    const { streamChat } = await import('../src/server/chat/service.js');

    const events = [];
    for await (const event of streamChat({
      userId: 'fast-path-user',
      message: 'What should I do today?',
      context: {
        locale: 'en',
        page: 'ai',
        market: 'US',
        assetClass: 'US_STOCK',
        symbol: 'SPY',
      },
    })) {
      events.push(event);
    }

    const done = events.find((event) => event.type === 'done') as
      | { type: 'done'; mode: string; provider: string; threadId: string }
      | undefined;
    expect(done?.provider).toBe('deterministic');
    expect(providerStream).not.toHaveBeenCalled();
    const assistantMessage = repoState.messages.find((row) => row.role === 'assistant');
    expect(String(assistantMessage?.content || '')).toContain('SPY');
    expect(repoState.upsertThreadCalls).toHaveLength(2);
  });
});

import type { ChatRequestInput, ChatMode, StreamEvent } from './types.js';
import { buildContextBundle } from './tools.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts.js';
import { createProvider, getProviderOrder, isProviderConfigured } from './providers/index.js';
import { ProviderRateLimitError } from './providers/errors.js';

function detectMode(input: ChatRequestInput): ChatMode {
  if (
    input.context?.signalId ||
    input.context?.symbol ||
    input.context?.market ||
    input.context?.assetClass ||
    input.context?.timeframe
  ) {
    return 'context-aware';
  }
  return 'general-coach';
}

export async function* streamChat(input: ChatRequestInput): AsyncGenerator<StreamEvent> {
  const mode = detectMode(input);
  const contextBundle = await buildContextBundle({ userId: input.userId, context: input.context });

  const providerOrder = getProviderOrder().filter((name) => isProviderConfigured(name));
  if (!providerOrder.length) {
    yield {
      type: 'error',
      error:
        'No provider configured. Set AI_PROVIDER=groq|gemini|openai and corresponding API key (or OLLAMA_BASE_URL).'
    };
    return;
  }

  const systemPrompt = buildSystemPrompt(mode, contextBundle.hasExactSignalData);
  const userPrompt = buildUserPrompt({
    userMessage: input.message,
    mode,
    contextBundle,
    context: input.context
  });

  const contextAwareNoData = mode === 'context-aware' && !contextBundle.hasExactSignalData;

  const providerErrors: string[] = [];

  for (let i = 0; i < providerOrder.length; i += 1) {
    const providerName = providerOrder[i];
    const provider = createProvider(providerName);

    try {
      yield { type: 'meta', mode, provider: provider.name };

      if (contextAwareNoData) {
        yield {
          type: 'chunk',
          delta: 'I don’t have your exact signal data yet, so here’s a general guideline.\n\n'
        };
      }

      for await (const chunk of provider.stream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        maxTokens: 650
      })) {
        yield { type: 'chunk', delta: chunk };
      }

      yield {
        type: 'chunk',
        delta: '\n\nDisclaimer: educational, not financial advice.'
      };

      yield { type: 'done', mode, provider: provider.name };
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      providerErrors.push(`${provider.name}: ${msg}`);

      const isRateLimit = error instanceof ProviderRateLimitError;
      const hasNextProvider = i < providerOrder.length - 1;
      // Per product requirement, only rate-limit events trigger fallback.
      if (!isRateLimit || !hasNextProvider) break;
    }
  }

  const errorSuffix = providerErrors.length ? `: ${providerErrors.join(' | ')}` : '';
  yield {
    type: 'error',
    error: `Failed to generate response${errorSuffix}`
  };
}

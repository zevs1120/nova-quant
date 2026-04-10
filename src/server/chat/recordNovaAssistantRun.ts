import { getRuntimeRepo } from '../db/runtimeRepository.js';
import { logNovaAssistantAnswer } from '../nova/service.js';

/** Persists Nova Assistant turns without pulling in `queries.ts`. */
export async function recordNovaAssistantRun(args: {
  userId: string;
  threadId?: string;
  context?: Record<string, unknown>;
  message: string;
  responseText: string;
  provider: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
}) {
  const repo = getRuntimeRepo();
  await logNovaAssistantAnswer({
    repo,
    userId: args.userId,
    threadId: args.threadId,
    context: args.context || {},
    message: args.message,
    responseText: args.responseText,
    provider: args.provider,
    status: args.status,
    error: args.error,
  });
}

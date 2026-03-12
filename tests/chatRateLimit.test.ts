import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../src/server/chat/rateLimit.js';

describe('chat rate limit', () => {
  it('blocks excessive requests for same user within window', () => {
    const userId = `test-user-${Date.now()}`;
    let blocked = false;

    for (let i = 0; i < 40; i += 1) {
      const result = checkRateLimit(userId);
      if (!result.allowed) {
        blocked = true;
        break;
      }
    }

    expect(blocked).toBe(true);
  });
});

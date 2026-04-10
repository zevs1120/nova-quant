import { describe, expect, it } from 'vitest';
import type express from 'express';
import { queryUserIdOrGuest } from '../src/server/api/helpers.js';

function mockReq(query: Record<string, unknown>): express.Request {
  return { query } as express.Request;
}

describe('queryUserIdOrGuest', () => {
  it('returns guest-default when userId is missing', () => {
    expect(queryUserIdOrGuest(mockReq({}))).toBe('guest-default');
  });

  it('returns query userId when present', () => {
    expect(queryUserIdOrGuest(mockReq({ userId: 'usr_test' }))).toBe('usr_test');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerThreadsMock = vi.hoisted(() => {
  const receiveMessageOnPort = vi.fn();
  const postMessage = vi.fn();
  const start = vi.fn();
  const terminate = vi.fn();
  const workerHandlers = new Map<string, (arg?: unknown) => void>();

  class MockPort {
    start = start;
    postMessage = postMessage;
  }

  class MockWorker {
    on(event: string, handler: (arg?: unknown) => void) {
      workerHandlers.set(event, handler);
      return this;
    }

    terminate = terminate;
  }

  class MockMessageChannel {
    port1 = new MockPort();
    port2 = new MockPort();
  }

  return {
    MockMessageChannel,
    MockPort,
    MockWorker,
    postMessage,
    receiveMessageOnPort,
    start,
    terminate,
    workerHandlers,
  };
});

vi.mock('node:worker_threads', () => ({
  MessageChannel: workerThreadsMock.MockMessageChannel,
  MessagePort: workerThreadsMock.MockPort,
  Worker: workerThreadsMock.MockWorker,
  receiveMessageOnPort: workerThreadsMock.receiveMessageOnPort,
}));

describe('postgres sync bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NOVA_DATA_DATABASE_URL', 'postgres://runtime-host/db');
    workerThreadsMock.workerHandlers.clear();
    workerThreadsMock.postMessage.mockReset();
    workerThreadsMock.receiveMessageOnPort.mockReset();
    workerThreadsMock.start.mockReset();
    workerThreadsMock.terminate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns worker rows for sync queries', async () => {
    workerThreadsMock.receiveMessageOnPort.mockReturnValueOnce({
      message: {
        id: 1,
        ok: true,
        result: {
          rows: [{ value: 1 }],
          rowCount: 1,
          command: 'SELECT',
        },
      },
    });

    const bridge = await import('../src/server/db/postgresSyncBridge.js');

    expect(bridge.queryRowsSync<{ value: number }>('SELECT 1')).toEqual([{ value: 1 }]);
    expect(workerThreadsMock.postMessage).toHaveBeenCalledWith({
      id: 1,
      kind: 'query',
      sql: 'SELECT 1',
      params: [],
    });
  });

  it('throws the original worker error before polling a nulled message port', async () => {
    workerThreadsMock.postMessage.mockImplementation(() => {
      workerThreadsMock.workerHandlers.get('error')?.(new Error('SIMULATED_WORKER_CRASH'));
    });

    const bridge = await import('../src/server/db/postgresSyncBridge.js');

    expect(() => bridge.executeSync('SELECT 1')).toThrow('SIMULATED_WORKER_CRASH');
    expect(workerThreadsMock.receiveMessageOnPort).not.toHaveBeenCalled();
  });

  it('clears the bridge error after throwing so the next request can reinitialize', async () => {
    workerThreadsMock.postMessage
      .mockImplementationOnce(() => {
        workerThreadsMock.workerHandlers.get('error')?.(new Error('FIRST_WORKER_CRASH'));
      })
      .mockImplementation(() => {});
    workerThreadsMock.receiveMessageOnPort.mockReturnValueOnce({
      message: {
        id: 2,
        ok: true,
        result: {
          rows: [{ value: 2 }],
          rowCount: 1,
          command: 'SELECT',
        },
      },
    });

    const bridge = await import('../src/server/db/postgresSyncBridge.js');

    expect(() => bridge.executeSync('SELECT 1')).toThrow('FIRST_WORKER_CRASH');
    expect(bridge.queryRowSync<{ value: number }>('SELECT 2')).toEqual({ value: 2 });
  });
});

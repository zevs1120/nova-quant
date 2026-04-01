import http from 'node:http';
import { Duplex } from 'node:stream';
import type express from 'express';

type QueryValue = string | number | boolean | null | undefined;

export type LocalHttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
  body: any;
};

type LocalHttpRequestArgs = {
  method?: string;
  path: string;
  query?: Record<string, QueryValue | QueryValue[]>;
  headers?: Record<string, string>;
  body?: unknown;
};

class MockSocket extends Duplex {
  private readonly chunks: Buffer[] = [];
  remoteAddress = '127.0.0.1';

  _read(): void {}

  _write(
    chunk: string | Buffer | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  setTimeout(): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }

  destroy(): this {
    return this;
  }

  readBodyText(): string {
    const payload = Buffer.concat(this.chunks).toString('utf8');
    const boundaryIndex = payload.indexOf('\r\n\r\n');
    return boundaryIndex >= 0 ? payload.slice(boundaryIndex + 4) : payload;
  }
}

function appendQuery(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue | QueryValue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => appendQuery(searchParams, key, entry));
    return;
  }
  if (value === null || value === undefined) return;
  searchParams.append(key, String(value));
}

function buildRequestUrl(path: string, query?: LocalHttpRequestArgs['query']) {
  const url = new URL(path, 'http://127.0.0.1');
  if (!query) return `${url.pathname}${url.search}`;
  Object.entries(query).forEach(([key, value]) => appendQuery(url.searchParams, key, value));
  return `${url.pathname}${url.search}`;
}

function normalizeHeaders(headers: Record<string, string> | undefined, hasBody: boolean) {
  const next: Record<string, string> = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    next[String(key || '').toLowerCase()] = value;
  });
  if (!next.host) {
    next.host = '127.0.0.1';
  }
  if (hasBody && !next['content-type']) {
    next['content-type'] = 'application/json';
  }
  return next;
}

function normalizeResponseHeaders(response: http.ServerResponse) {
  const headers: Record<string, string> = {};
  Object.entries(response.getHeaders()).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      headers[key.toLowerCase()] = value.join(', ');
      return;
    }
    if (value !== undefined) {
      headers[key.toLowerCase()] = String(value);
    }
  });
  return headers;
}

function parseResponseBody(response: http.ServerResponse, text: string): any {
  const contentType = String(response.getHeader('content-type') || '');
  if (!text) return null;
  if (!/application\/json/i.test(contentType)) {
    return text;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function requestLocalHttp(
  app: express.Express,
  args: LocalHttpRequestArgs,
): Promise<LocalHttpResponse> {
  const payload = args.body === undefined ? null : Buffer.from(JSON.stringify(args.body), 'utf8');
  const socket = new MockSocket();
  const req = new http.IncomingMessage(socket as unknown as any);
  req.method = String(args.method || 'GET').toUpperCase();
  req.url = buildRequestUrl(args.path, args.query);
  req.headers = normalizeHeaders(args.headers, Boolean(payload));
  if (payload) {
    req.headers['content-length'] = String(payload.byteLength);
  }

  const res = new http.ServerResponse(req);
  res.assignSocket(socket as unknown as any);

  const finished = new Promise<void>((resolve, reject) => {
    res.once('finish', resolve);
    res.once('error', reject);
  });

  try {
    app(req as unknown as express.Request, res as unknown as express.Response);
    if (payload) {
      req.push(payload);
    }
    req.push(null);
    await finished;
  } finally {
    res.detachSocket(socket as unknown as any);
  }

  const text = socket.readBodyText();
  return {
    status: res.statusCode,
    headers: normalizeResponseHeaders(res),
    text,
    body: parseResponseBody(res, text),
  };
}

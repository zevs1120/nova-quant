export class ProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = options?.retryable ?? true;
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: true });
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: true });
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderSchemaError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: true });
    this.name = 'ProviderSchemaError';
  }
}

export class ProviderEmptyResponseError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: true });
    this.name = 'ProviderEmptyResponseError';
  }
}

export class ProviderNetworkError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: true });
    this.name = 'ProviderNetworkError';
  }
}

export function shouldFallbackProviderError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.retryable;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      error.name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('fetch failed') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('empty response') ||
      message.includes('malformed') ||
      message.includes('schema')
    );
  }
  return false;
}

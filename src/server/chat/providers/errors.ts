export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRateLimitError';
  }
}

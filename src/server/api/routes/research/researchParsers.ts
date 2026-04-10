export function parseQlibFactorSet(value: unknown): 'Alpha158' | 'Alpha360' | undefined {
  if (value === 'Alpha158' || value === 'Alpha360') return value;
  return undefined;
}

export function parsePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const [key, valueFromInline] = token.slice(2).split('=');
    if (valueFromInline !== undefined) {
      out[key] = valueFromInline;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }

    out[key] = next;
    i += 1;
  }
  return out;
}

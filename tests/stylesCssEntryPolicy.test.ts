import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Ensures global `styles.css` stays first-paint only; heavy surfaces stay lazy-bound. */
describe('src/styles.css entry policy', () => {
  const cssPath = path.join(__dirname, '..', 'src', 'styles.css');
  const source = fs.readFileSync(cssPath, 'utf8');

  it('documents lazy-loaded tab CSS split', () => {
    expect(source).toMatch(/lazy-loaded components/i);
    expect(source).toMatch(/code-split/i);
  });

  it('does not import today-final or ai-rebuild at global entry', () => {
    expect(source).not.toMatch(/today-final/);
    expect(source).not.toMatch(/ai-rebuild/);
    expect(source).not.toMatch(/today-redesign/);
    expect(source).not.toMatch(/robinhood-surfaces/);
  });
});

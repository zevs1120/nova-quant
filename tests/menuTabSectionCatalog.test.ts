import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MenuTab.jsx section routing catalog', () => {
  const menuPath = path.join(__dirname, '..', 'src', 'components', 'MenuTab.jsx');
  const source = fs.readFileSync(menuPath, 'utf8');

  const sectionMatches = [...source.matchAll(/section\s*===\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const unique = [...new Set(sectionMatches)];

  it('defines multiple routed sections', () => {
    expect(unique.length).toBeGreaterThanOrEqual(12);
  });

  const mustInclude = [
    'support',
    'prediction-games',
    'support-chats',
    'membership',
    'points',
    'help-center',
    'disclosures',
    'privacy-policy',
  ];

  it.each(mustInclude)('includes section branch %s', (key) => {
    expect(unique).toContain(key);
  });
});

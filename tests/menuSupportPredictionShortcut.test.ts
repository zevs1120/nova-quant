import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard: Support hub exposes Prediction Games without hunting the menu tree.
 */
describe('MenuTab support → prediction games shortcut', () => {
  const menuPath = path.join(__dirname, '..', 'src', 'components', 'MenuTab.jsx');
  const source = fs.readFileSync(menuPath, 'utf8');

  it('defines a prediction-games section branch', () => {
    expect(source).toMatch(/section\s*===\s*['"]prediction-games['"]/);
  });

  it('wires Support callout to prediction-games', () => {
    expect(source).toMatch(/onSectionChange\(\s*['"]prediction-games['"]\s*\)/);
  });

  it('lists prediction-games in root section metadata', () => {
    expect(source).toMatch(/key:\s*['"]prediction-games['"]/);
  });
});

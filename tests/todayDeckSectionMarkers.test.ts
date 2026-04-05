import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TodayDeckSection.jsx markers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'today', 'TodayDeckSection.jsx'),
    'utf8',
  );

  it('owns the stack list and empty state rendering', () => {
    expect(source).toContain("import '../../styles/today-deck.css'");
    expect(source).toContain('today-stack-list');
    expect(source).toContain('today-rebuild-empty');
    expect(source).toContain('TodayDeckEmptyState');
  });

  it('keeps the tap usage guide with the deck section', () => {
    expect(source).toContain('today-usage-guide-stack');
    expect(source).toContain('guideCopy.tapHint');
    expect(source).toContain('onCompleteUsageGuide');
  });
});

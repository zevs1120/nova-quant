import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Markers for stacked cards + swipe gesture work in Today (no full gesture simulation). */
describe('TodayTab.jsx shell markers', () => {
  const todayPath = path.join(__dirname, '..', 'src', 'components', 'TodayTab.jsx');
  const source = fs.readFileSync(todayPath, 'utf8');

  it('embeds signal detail and fetch/merge helpers', () => {
    expect(source).toContain("import SignalDetail from './SignalDetail'");
    expect(source).toContain("import TodayDeckSection from './today/TodayDeckSection.jsx'");
    expect(source).toContain('fetchSignalDetail');
    expect(source).toContain('mergeSignalDetail');
  });

  it('implements swipe gesture state for the card deck', () => {
    expect(source).toContain('swipeGestureRef');
    expect(source).toContain('previewGestureRef');
  });

  it('imports today-shell and today-final for layered chrome ownership', () => {
    expect(source).toContain("import '../styles/today-shell.css'");
    expect(source).toContain("import '../styles/today-final.css'");
  });
});

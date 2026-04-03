import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Regression guard: signal detail uses scoped CSS and humanized row layout. */
describe('SignalDetail.jsx markers', () => {
  const detailPath = path.join(__dirname, '..', 'src', 'components', 'SignalDetail.jsx');
  const source = fs.readFileSync(detailPath, 'utf8');

  it('pulls today-final styles from the component (not only global CSS)', () => {
    expect(source).toContain("import '../styles/today-final.css'");
  });

  it('delegates human labels to signalHumanLabels util', () => {
    expect(source).toContain("from '../utils/signalHumanLabels.js'");
    expect(source).toContain("from '../utils/signalEntryBounds.js'");
  });

  it('renders structured detail rows', () => {
    expect(source).toContain('detail-row');
    expect(source).toContain('detail-label');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('FirstRunSetupFlow styles', () => {
  it('imports onboarding.css at component entry', () => {
    const p = path.join(__dirname, '..', 'src', 'components', 'FirstRunSetupFlow.jsx');
    const src = fs.readFileSync(p, 'utf8');
    expect(src.startsWith("import '../styles/onboarding.css'")).toBe(true);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('onboarding css split', () => {
  it('keeps onboarding shell styles in a dedicated layer', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'styles', 'onboarding.css'),
      'utf8',
    );
    expect(source).toContain("@import './onboarding-shell.css';");
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Static markers for the Ask Nova / AiPage rebuild (dark shell + structured sections). */
describe('AiPage.jsx shell markers', () => {
  const aiPath = path.join(__dirname, '..', 'src', 'components', 'AiPage.jsx');
  const source = fs.readFileSync(aiPath, 'utf8');

  it('keeps copilot section keys for structured replies', () => {
    expect(source).toContain(
      "const COPILOT_SECTIONS = ['VERDICT', 'PLAN', 'WHY', 'RISK', 'EVIDENCE']",
    );
  });

  it('uses nova-ai-* layout classes', () => {
    expect(source).toMatch(/className=\{?['"]nova-ai-/);
    expect(source).toContain('nova-ai-section');
  });

  it('imports the rebuild stylesheet from the component', () => {
    expect(source).toMatch(/import\s+['"]\.\.\/styles\/ai-rebuild\.css['"]/);
  });
});

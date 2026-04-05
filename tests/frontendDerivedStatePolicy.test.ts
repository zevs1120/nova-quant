import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend derived-state placement policy', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const rulesPath = path.join(__dirname, '..', 'docs', 'FRONTEND_DERIVED_STATE_RULES.md');
  const rulesSource = fs.readFileSync(rulesPath, 'utf8');

  it('documents the canonical placement for shell and feature state helpers', () => {
    expect(rulesSource).toContain('src/app/topBarState.js');
    expect(rulesSource).toContain('src/app/shellLayout.js');
    expect(rulesSource).toContain('src/app/screenRegistry.jsx');
    expect(rulesSource).toContain('src/components/today/todayDeckState.js');
  });

  it('keeps App shell consuming dedicated state helpers instead of inline render/state blocks', () => {
    expect(appSource).toContain("import { deriveShellLayout } from './app/shellLayout.js';");
    expect(appSource).toContain("import { renderActiveScreen } from './app/screenRegistry.jsx';");
    expect(appSource).toContain(
      "import { deriveTopBarState, PRIMARY_TAB_KEYS } from './app/topBarState.js';",
    );
    expect(appSource).not.toContain('const renderScreen = () => {');
    expect(appSource).not.toContain('const renderMenuSection = (section) => {');
  });
});

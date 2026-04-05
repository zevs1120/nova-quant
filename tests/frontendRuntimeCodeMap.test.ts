import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend runtime code map', () => {
  const repoRoot = path.join(__dirname, '..');
  const read = (relPath: string) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

  it('documents the current shell and runtime entry points', () => {
    const mapSource = read('docs/FRONTEND_RUNTIME_CODE_MAP.md');
    expect(mapSource).toContain('src/App.jsx');
    expect(mapSource).toContain('src/app/topBarState.js');
    expect(mapSource).toContain('src/app/shellLayout.js');
    expect(mapSource).toContain('src/app/screenRegistry.jsx');
    expect(mapSource).toContain('src/hooks/useAppData.js');
    expect(mapSource).toContain('src/server/api/queries/runtimeReads.ts');
    expect(mapSource).toContain('src/server/api/queries/todayReads.ts');
    expect(mapSource).toContain('src/server/api/queries/browseReads.ts');
    expect(mapSource).toContain('src/server/api/queries/engagementReads.ts');
    expect(mapSource).toContain('src/server/api/queries/portfolioReads.ts');
  });

  it('keeps the README linked to the code map and extracted query slices', () => {
    const readmeSource = read('README.md');
    expect(readmeSource).toContain('docs/FRONTEND_RUNTIME_CODE_MAP.md');
    expect(readmeSource).toContain('src/server/api/queries/runtimeReads.ts');
    expect(readmeSource).toContain('src/server/api/queries/todayReads.ts');
    expect(readmeSource).toContain('src/server/api/queries/browseReads.ts');
    expect(readmeSource).toContain('src/server/api/queries/engagementReads.ts');
    expect(readmeSource).toContain('src/server/api/queries/portfolioReads.ts');
  });
});

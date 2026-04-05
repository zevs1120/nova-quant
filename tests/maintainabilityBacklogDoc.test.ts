import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('maintainability backlog doc', () => {
  const repoRoot = path.join(__dirname, '..');
  const read = (relPath: string) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

  it('tracks current maintainability hotspots and next cuts', () => {
    const backlogSource = read('docs/MAINTAINABILITY_BACKLOG.md');
    expect(backlogSource).toContain('src/server/api/queries.ts');
    expect(backlogSource).toContain('src/components/TodayTab.jsx');
    expect(backlogSource).toContain('TodayDeckSection.jsx');
    expect(backlogSource).toContain('src/styles/today-final.css');
    expect(backlogSource).toContain('src/styles/today-shell.css');
    expect(backlogSource).toContain('src/styles/today-deck.css');
    expect(backlogSource).toContain('src/styles/onboarding.css');
    expect(backlogSource).toContain('Continue splitting `src/styles/today-final.css`');
    expect(backlogSource).toContain('Keep boundary tests current');
  });

  it('keeps the README linked to the maintainability backlog', () => {
    const readmeSource = read('README.md');
    expect(readmeSource).toContain('docs/MAINTAINABILITY_BACKLOG.md');
  });
});

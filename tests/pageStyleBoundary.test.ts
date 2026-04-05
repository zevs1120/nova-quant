import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('page style boundaries', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  const read = (relPath: string) => fs.readFileSync(path.join(srcRoot, relPath), 'utf8');

  it('keeps heavy page CSS inside the owning lazy components', () => {
    expect(read(path.join('components', 'TodayTab.jsx'))).toContain(
      "import '../styles/today-shell.css'",
    );
    expect(read(path.join('components', 'TodayTab.jsx'))).toContain(
      "import '../styles/today-final.css'",
    );
    expect(read(path.join('components', 'today', 'TodayDeckSection.jsx'))).toContain(
      "import '../../styles/today-deck.css'",
    );
    expect(read(path.join('components', 'AiPage.jsx'))).toMatch(
      /import\s+['"]\.\.\/styles\/ai-rebuild\.css['"]/,
    );
    expect(read(path.join('components', 'BrowseTab.jsx'))).toMatch(
      /import\s+['"]\.\.\/styles\/browse\.css['"]/,
    );
    expect(read(path.join('components', 'MenuTab.jsx'))).toMatch(
      /import\s+['"]\.\.\/styles\/menu\.css['"]/,
    );
    expect(read(path.join('components', 'WatchlistTab.jsx'))).toMatch(
      /import\s+['"]\.\.\/styles\/watchlist\.css['"]/,
    );
  });

  it('keeps the screen registry styling-free', () => {
    const registrySource = read(path.join('app', 'screenRegistry.jsx'));
    expect(registrySource).not.toMatch(/styles\//);
    expect(registrySource).not.toMatch(/className=.*top-bar/);
    expect(registrySource).not.toMatch(/native-tabbar/);
  });
});

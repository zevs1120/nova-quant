import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CSS responsibility layers', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  const read = (relPath: string) => fs.readFileSync(path.join(srcRoot, relPath), 'utf8');

  it('keeps shell tokens in the global style entry only', () => {
    const entry = read('styles.css');
    expect(entry).toContain("@import './styles/shell-tokens.css';");
    expect(entry).not.toContain('page-surface-tokens.css');
  });

  it('keeps page surface tokens owned by page-level stylesheets', () => {
    expect(read(path.join('styles', 'ai-rebuild.css'))).toContain(
      "@import './page-surface-tokens.css';",
    );
    expect(read(path.join('styles', 'browse.css'))).toContain(
      "@import './page-surface-tokens.css';",
    );
    expect(read(path.join('styles', 'menu.css'))).toContain("@import './page-surface-tokens.css';");
    expect(read(path.join('styles', 'watchlist.css'))).toContain(
      "@import './page-surface-tokens.css';",
    );
  });

  it('keeps secondary shell chrome driven by shell tokens instead of hardcoded panel constants', () => {
    const shellCss = read(path.join('styles', 'secondary-shell.css'));
    expect(shellCss).toContain('var(--secondary-shell-panel-inset)');
    expect(shellCss).toContain('var(--secondary-shell-panel-radius)');
    expect(shellCss).toContain('var(--secondary-shell-panel-fill)');
  });

  it('keeps Today shell chrome in a dedicated stylesheet ahead of deck/detail styles', () => {
    const todayTabSource = read(path.join('components', 'TodayTab.jsx'));
    const todayShellSource = read(path.join('styles', 'today-shell.css'));
    const todayFinalSource = read(path.join('styles', 'today-final.css'));
    expect(todayTabSource).toContain("import '../styles/today-shell.css'");
    expect(todayShellSource).toContain('.today-hero-shell');
    expect(todayShellSource).toContain('.today-pace-module');
    expect(todayFinalSource).not.toContain('.today-hero-shell');
    expect(todayFinalSource).not.toContain('.today-pace-module');
  });
});

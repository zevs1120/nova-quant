import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('shell boundary policy', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const shellLayoutPath = path.join(__dirname, '..', 'src', 'app', 'shellLayout.js');
  const stylesEntryPath = path.join(__dirname, '..', 'src', 'styles.css');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const shellLayoutSource = fs.readFileSync(shellLayoutPath, 'utf8');
  const stylesEntrySource = fs.readFileSync(stylesEntryPath, 'utf8');

  it('routes secondary surfaces through the shared shell layout helper', () => {
    expect(shellLayoutSource).toContain("shellCanvasKey: 'nova'");
    expect(shellLayoutSource).toContain("shellCanvasKey: 'browse'");
    expect(shellLayoutSource).toContain(
      "const surface = mySection === 'watchlist' ? 'my' : 'menu';",
    );
    expect(shellLayoutSource).toContain('shellCanvasKey: surface');
    expect(appSource).toContain('data-shell-surface={shellSurface}');
    expect(appSource).toContain('data-secondary-canvas={shellCanvasKey}');
  });

  it('keeps global entry limited to shell-level CSS modules', () => {
    expect(stylesEntrySource).toContain("@import './styles/secondary-shell.css';");
    expect(stylesEntrySource).not.toMatch(/browse\.css/);
    expect(stylesEntrySource).not.toMatch(/menu\.css/);
    expect(stylesEntrySource).not.toMatch(/watchlist\.css/);
    expect(stylesEntrySource).not.toMatch(/today-final\.css/);
    expect(stylesEntrySource).not.toMatch(/ai-rebuild\.css/);
  });
});

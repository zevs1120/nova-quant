import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App.jsx secondary shell markers', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const source = fs.readFileSync(appPath, 'utf8');

  it('derives shell layout from a dedicated helper', () => {
    expect(source).toContain("import { deriveShellLayout } from './app/shellLayout.js'");
    expect(source).toContain('deriveShellLayout({');
  });

  it('wraps secondary tabs in a shared canvas', () => {
    expect(source).toContain('main-content-secondary');
    expect(source).toContain('screen-transition-secondary');
    expect(source).toContain('secondary-page-canvas');
    expect(source).toContain('data-secondary-canvas={shellCanvasKey}');
  });
});

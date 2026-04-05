import { describe, expect, it } from 'vitest';
import { deriveShellLayout } from '../src/app/shellLayout.js';

describe('shellLayout', () => {
  it('keeps Today on the primary shell', () => {
    expect(deriveShellLayout({ activeTab: 'today', mySection: 'watchlist' })).toEqual({
      isSecondaryShell: false,
      shellCanvasKey: 'today',
      shellSurface: 'today',
    });
  });

  it('maps secondary surfaces to stable canvas keys', () => {
    expect(deriveShellLayout({ activeTab: 'ai', mySection: 'watchlist' })).toEqual({
      isSecondaryShell: true,
      shellCanvasKey: 'nova',
      shellSurface: 'nova',
    });
    expect(deriveShellLayout({ activeTab: 'browse', mySection: 'watchlist' })).toEqual({
      isSecondaryShell: true,
      shellCanvasKey: 'browse',
      shellSurface: 'browse',
    });
    expect(deriveShellLayout({ activeTab: 'my', mySection: 'watchlist' })).toEqual({
      isSecondaryShell: true,
      shellCanvasKey: 'my',
      shellSurface: 'my',
    });
    expect(deriveShellLayout({ activeTab: 'my', mySection: 'settings' })).toEqual({
      isSecondaryShell: true,
      shellCanvasKey: 'menu',
      shellSurface: 'menu',
    });
  });
});

export function deriveShellLayout({ activeTab, mySection }) {
  if (activeTab === 'today') {
    return {
      isSecondaryShell: false,
      shellCanvasKey: 'today',
      shellSurface: 'today',
    };
  }

  if (activeTab === 'ai') {
    return {
      isSecondaryShell: true,
      shellCanvasKey: 'nova',
      shellSurface: 'nova',
    };
  }

  if (activeTab === 'browse') {
    return {
      isSecondaryShell: true,
      shellCanvasKey: 'browse',
      shellSurface: 'browse',
    };
  }

  if (activeTab === 'my') {
    const surface = mySection === 'watchlist' ? 'my' : 'menu';
    return {
      isSecondaryShell: true,
      shellCanvasKey: surface,
      shellSurface: surface,
    };
  }

  return {
    isSecondaryShell: false,
    shellCanvasKey: String(activeTab || 'app'),
    shellSurface: String(activeTab || 'app'),
  };
}

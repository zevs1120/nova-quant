import { describe, expect, it } from 'vitest';
import { deriveTopBarState, PRIMARY_TAB_KEYS } from '../src/app/topBarState.js';

describe('topBarState', () => {
  it('keeps the canonical primary tab order stable', () => {
    expect(PRIMARY_TAB_KEYS).toEqual(['today', 'ai', 'browse', 'my']);
  });

  it('derives browse and my detail titles consistently', () => {
    const browseState = deriveTopBarState({
      activeTab: 'browse',
      mySection: 'watchlist',
      myStack: ['watchlist'],
      browseTopBarState: {
        canGoBack: true,
        title: 'SPY',
        backLabel: 'Browse',
      },
      menuTitles: {},
      tabMeta: {
        browse: { label: 'Browse' },
        my: { label: 'My' },
      },
      locale: 'en',
    });
    expect(browseState.canGoBackInTopBar).toBe(true);
    expect(browseState.topBarCenterTitle).toBe('SPY');
    expect(browseState.topBarBackLabel).toBe('Browse');

    const myState = deriveTopBarState({
      activeTab: 'my',
      mySection: 'settings',
      myStack: ['watchlist', 'settings'],
      browseTopBarState: {
        canGoBack: false,
        title: 'Browse',
        backLabel: 'Browse',
      },
      menuTitles: {
        settings: 'Settings',
      },
      tabMeta: {
        browse: { label: 'Browse' },
        my: { label: 'My' },
      },
      locale: 'en',
    });
    expect(myState.canGoBackInMyTopBar).toBe(true);
    expect(myState.topBarCenterTitle).toBe('Settings');
    expect(myState.topBarBackLabel).toBe('Watchlist');
  });
});

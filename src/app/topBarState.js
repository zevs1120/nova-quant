export const PRIMARY_TAB_KEYS = ['today', 'ai', 'browse', 'my'];

export function deriveTopBarState(args) {
  const { activeTab, mySection, myStack, browseTopBarState, menuTitles, tabMeta, locale } = args;
  const canGoBackInMyTopBar = activeTab === 'my' && myStack.length > 1;
  const canGoBackInBrowseTopBar = activeTab === 'browse' && browseTopBarState.canGoBack;
  const canGoBackInTopBar = canGoBackInMyTopBar || canGoBackInBrowseTopBar;
  const hideTopBarForWatchlist = activeTab === 'my' && mySection === 'watchlist';
  const showHoldingsMenuAction = activeTab === 'my' && mySection === 'watchlist';
  const showCenterTopBarTitle = activeTab === 'browse' || activeTab === 'ai' || activeTab === 'my';
  const previousMySection = canGoBackInMyTopBar ? myStack[myStack.length - 2] : null;
  const topBarBackLabel = canGoBackInBrowseTopBar
    ? browseTopBarState.backLabel
    : previousMySection && previousMySection !== 'watchlist'
      ? menuTitles[previousMySection] || tabMeta.my.label
      : locale.startsWith('zh')
        ? '观察列表'
        : 'Watchlist';
  const topBarCenterTitle =
    activeTab === 'browse'
      ? browseTopBarState.title || tabMeta.browse.label
      : activeTab === 'ai'
        ? 'Ask Nova'
        : activeTab === 'my'
          ? mySection === 'watchlist'
            ? locale.startsWith('zh')
              ? '观察列表'
              : 'Watchlist'
            : mySection === 'menu'
              ? 'Menu'
              : menuTitles[mySection] || tabMeta.my.label
          : '';

  return {
    canGoBackInMyTopBar,
    canGoBackInBrowseTopBar,
    canGoBackInTopBar,
    hideTopBarForWatchlist,
    showHoldingsMenuAction,
    showCenterTopBarTitle,
    previousMySection,
    topBarBackLabel,
    topBarCenterTitle,
    topBarMode: canGoBackInTopBar ? 'detail' : 'root',
  };
}

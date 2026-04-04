import '../styles/watchlist.css';
import { useMemo } from 'react';

function asSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function formatPercent(value, locale) {
  if (!Number.isFinite(value)) return '--';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${Number(value).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function buildSignalMap(signals = []) {
  return new Map(
    (signals || [])
      .map((signal) => [asSymbol(signal?.symbol || signal?.ticker), signal])
      .filter((entry) => entry[0]),
  );
}

function buildInstrumentMap(marketInstruments = []) {
  return new Map(
    (marketInstruments || []).map((item) => [asSymbol(item?.ticker || item?.symbol), item]),
  );
}

function latestSevenDayPerformance(instrument) {
  const bars = Array.isArray(instrument?.bars) ? instrument.bars : [];
  if (bars.length < 2) return null;
  const recent = bars.slice(-7);
  const first = Number(recent[0]?.close);
  const last = Number(recent[recent.length - 1]?.close);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
  return ((last - first) / first) * 100;
}

function signalSuggestion(signal, locale) {
  if (!signal) return locale?.startsWith('zh') ? '等 Nova 再看一眼' : 'Ask Nova for a fresh read';
  const direction = String(signal?.direction || '').toUpperCase();
  const actionable = ['NEW', 'TRIGGERED'].includes(String(signal?.status || '').toUpperCase());
  if (!actionable) return locale?.startsWith('zh') ? '先继续观察' : 'Keep it on watch';
  if (direction === 'SHORT')
    return locale?.startsWith('zh') ? '更像先减风险' : 'Looks like reduce risk';
  if (direction === 'LONG')
    return locale?.startsWith('zh') ? '更像等一个买点' : 'Looks like wait for an entry';
  return locale?.startsWith('zh') ? '先别急着动' : 'No rush yet';
}

function signalRating(signal, locale) {
  if (!signal) return locale?.startsWith('zh') ? 'Hold' : 'Hold';
  const direction = String(signal?.direction || '').toUpperCase();
  const actionable = ['NEW', 'TRIGGERED'].includes(String(signal?.status || '').toUpperCase());
  if (!actionable) return 'Hold';
  if (direction === 'SHORT') return 'Sell';
  if (direction === 'LONG') return 'Buy';
  return 'Hold';
}

function folderDescription(type, locale) {
  if (type === 'today') {
    return locale?.startsWith('zh')
      ? '你在 Today 页上滑保存过的标的'
      : 'Tickers you saved on the Today page';
  }
  return locale?.startsWith('zh')
    ? '你在 Browse 或 Ask Nova 里手动加入的标的'
    : 'Tickers you added manually';
}

function emptyFolderCopy(type, locale) {
  if (type === 'today') {
    return locale?.startsWith('zh')
      ? '上滑保存一张 Today 卡，或点卡片右下角加入观察列表。'
      : 'Swipe up on a Today card, or tap its + Watchlist button.';
  }
  return locale?.startsWith('zh')
    ? '在 Browse 或 Ask Nova 里点 Add to Watchlist，就会出现在这里。'
    : 'Use Add to Watchlist in Browse or Ask Nova to collect favorites here.';
}

function PoweredFooter() {
  return <p className="watchlist-card-footer">Powered by Marvix AI Engine</p>;
}

function WatchlistFolder({ title, description, items, locale, type, onAskAi, onRemove }) {
  return (
    <section className="watchlist-folder">
      <div className="watchlist-folder-head">
        <div>
          <p className="watchlist-folder-kicker">{title}</p>
          <p className="watchlist-folder-copy">{description}</p>
        </div>
        <span className="watchlist-folder-count">{items.length}</span>
      </div>

      {items.length ? (
        <div className="watchlist-card-list">
          {items.map((item) => (
            <article key={item.symbol} className="watchlist-card">
              <div className="watchlist-card-main">
                <div className="watchlist-card-copy">
                  <h3 className="watchlist-card-symbol">{item.symbol}</h3>
                  <p className="watchlist-card-line">{item.primary}</p>
                  {item.secondary ? (
                    <p className="watchlist-card-line is-secondary">{item.secondary}</p>
                  ) : null}
                </div>
              </div>

              <div className="watchlist-card-actions">
                <button
                  type="button"
                  className="watchlist-action-button is-primary"
                  onClick={() => onAskAi?.(item)}
                >
                  {type === 'today'
                    ? locale?.startsWith('zh')
                      ? '再问 Nova'
                      : 'Ask Nova Again'
                    : locale?.startsWith('zh')
                      ? '让 Nova 重看'
                      : 'Re-Analyze by Nova'}
                </button>
                <button
                  type="button"
                  className="watchlist-action-button"
                  onClick={() => onRemove?.(item.symbol)}
                >
                  {locale?.startsWith('zh') ? '移除' : 'Remove'}
                </button>
              </div>

              <PoweredFooter />
            </article>
          ))}
        </div>
      ) : (
        <article className="watchlist-empty-card">
          <p className="watchlist-empty-title">
            {locale?.startsWith('zh') ? '这里还没有内容' : 'Nothing here yet'}
          </p>
          <p className="watchlist-empty-copy">{emptyFolderCopy(type, locale)}</p>
        </article>
      )}
    </section>
  );
}

export default function WatchlistTab({
  watchlist = [],
  watchlistMeta = {},
  signals = [],
  marketInstruments = [],
  locale,
  onAskAi,
  onToggleWatchlist,
  onOpenMenu,
}) {
  const signalMap = useMemo(() => buildSignalMap(signals), [signals]);
  const instrumentMap = useMemo(() => buildInstrumentMap(marketInstruments), [marketInstruments]);

  const groups = useMemo(() => {
    const todayItems = [];
    const customItems = [];

    for (const rawSymbol of watchlist || []) {
      const symbol = asSymbol(rawSymbol);
      if (!symbol) continue;
      const signal = signalMap.get(symbol);
      const instrument = instrumentMap.get(symbol);
      const meta = watchlistMeta?.[symbol] || null;
      const sevenDay = latestSevenDayPerformance(instrument);
      const item = {
        symbol,
        source: meta?.source === 'today' ? 'today' : 'custom',
        addedAt: meta?.addedAt || null,
        primary:
          meta?.source === 'today'
            ? signalSuggestion(signal, locale)
            : locale?.startsWith('zh')
              ? `当前 AI 评级 ${signalRating(signal, locale)}`
              : `Current AI rating ${signalRating(signal, locale)}`,
        secondary:
          meta?.source === 'today'
            ? locale?.startsWith('zh')
              ? `7日表现 ${formatPercent(sevenDay, locale)}`
              : `7-day performance ${formatPercent(sevenDay, locale)}`
            : null,
      };

      if (item.source === 'today') {
        todayItems.push(item);
      } else {
        customItems.push(item);
      }
    }

    const sortByAdded = (left, right) =>
      String(right.addedAt || '').localeCompare(String(left.addedAt || ''));

    return {
      today: todayItems.sort(sortByAdded),
      custom: customItems.sort(sortByAdded),
    };
  }, [instrumentMap, locale, signalMap, watchlist, watchlistMeta]);

  return (
    <section className="stack-gap menu-screen menu-root-screen watchlist-root-screen">
      <div className="menu-root-shell watchlist-root-shell">
        <section className="watchlist-hero">
          <div className="watchlist-hero-head">
            <div>
              <p className="watchlist-kicker">
                {locale?.startsWith('zh') ? '我的收藏' : 'My Favorites'}
              </p>
              <h1 className="watchlist-title">
                {locale?.startsWith('zh') ? '观察列表' : 'Watchlist'}
              </h1>
            </div>
            <button
              type="button"
              className="watchlist-menu-button"
              onClick={() => onOpenMenu?.()}
              aria-label={locale?.startsWith('zh') ? '打开菜单' : 'Open menu'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="watchlist-menu-icon">
                <path d="M4 6h16" />
                <path d="M7 12h13" />
                <path d="M10 18h10" />
              </svg>
            </button>
          </div>
          <p className="watchlist-subtitle">
            {locale?.startsWith('zh')
              ? '这里会保留你想继续关注的标的，结构尽量简单，一眼就能看懂。'
              : 'Keep the names you want to follow in one simple place.'}
          </p>
        </section>

        <WatchlistFolder
          title={locale?.startsWith('zh') ? '来自 Today 的保存' : 'Saved from Today'}
          description={folderDescription('today', locale)}
          items={groups.today}
          locale={locale}
          type="today"
          onAskAi={(item) =>
            onAskAi?.(
              locale?.startsWith('zh')
                ? `再帮我看一下 ${item.symbol}，现在最简单的结论是什么？`
                : `Look at ${item.symbol} again and give me the simplest takeaway.`,
              { page: 'watchlist', symbol: item.symbol, source: 'today' },
            )
          }
          onRemove={(symbol) => onToggleWatchlist?.(symbol, { mode: 'remove', source: 'today' })}
        />

        <WatchlistFolder
          title={locale?.startsWith('zh') ? '我手动加入的收藏' : 'My Custom Favorites'}
          description={folderDescription('custom', locale)}
          items={groups.custom}
          locale={locale}
          type="custom"
          onAskAi={(item) =>
            onAskAi?.(
              locale?.startsWith('zh')
                ? `重新分析一下 ${item.symbol}，现在该买、拿着还是回避？`
                : `Re-analyze ${item.symbol}. Is it buy, hold, or avoid right now?`,
              { page: 'watchlist', symbol: item.symbol, source: 'custom' },
            )
          }
          onRemove={(symbol) =>
            onToggleWatchlist?.(symbol, {
              mode: 'remove',
              source: 'custom',
            })
          }
        />
      </div>
    </section>
  );
}

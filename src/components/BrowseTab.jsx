import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';
import { fetchApiJson } from '../utils/api';

const MARKET_PRESETS = {
  US: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'],
  CRYPTO: ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX']
};

const CRYPTO_SYMBOLS = new Set([
  'BTC',
  'BTCUSDT',
  'ETH',
  'ETHUSDT',
  'SOL',
  'SOLUSDT',
  'XRP',
  'XRPUSDT',
  'BNB',
  'BNBUSDT',
  'DOGE',
  'DOGEUSDT',
  'ADA',
  'ADAUSDT',
  'AVAX',
  'AVAXUSDT',
  'LINK',
  'LINKUSDT',
  'LTC',
  'LTCUSDT'
]);

const DETAIL_RANGES = {
  '1D': { live: true },
  '1W': { tf: '1d', limit: 7 },
  '1M': { tf: '1d', limit: 30 },
  '3M': { tf: '1d', limit: 90 }
};

function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '');
}

function guessMarket(symbol, explicitMarket) {
  const market = String(explicitMarket || '').toUpperCase();
  if (market === 'CRYPTO' || market === 'US') return market;
  const upper = normalizeSymbol(symbol);
  if (upper.endsWith('USDT') || upper.endsWith('USD') || CRYPTO_SYMBOLS.has(upper)) return 'CRYPTO';
  return 'US';
}

function displaySymbol(symbol, market) {
  const upper = normalizeSymbol(symbol);
  if (market === 'CRYPTO') {
    return upper.replace(/USDT$/, '').replace(/USD$/, '') || upper;
  }
  return upper;
}

function compactPrice(value, locale) {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return formatNumber(value, 0, locale);
  if (Math.abs(value) >= 100) return formatNumber(value, 2, locale);
  if (Math.abs(value) >= 1) return formatNumber(value, 2, locale);
  return formatNumber(value, 4, locale);
}

function percentText(value, locale) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value * 100, 2, locale)}%`;
}

function formatAsOf(value, locale) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(locale || undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toneClass(value) {
  if (!Number.isFinite(value)) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function chartPath(values, width = 320, height = 140) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const safe = values.filter((value) => Number.isFinite(value));
  if (safe.length < 2) return '';
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  return safe
    .map((value, index) => {
      const x = (index / Math.max(safe.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function rangeText(low, high, locale) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '--';
  return `${compactPrice(low, locale)} - ${compactPrice(high, locale)}`;
}

function buildSelection(item, marketHint) {
  if (!item) return null;
  const symbol = normalizeSymbol(item.symbol || item.ticker || item.resolvedSymbol);
  if (!symbol) return null;
  const market = guessMarket(symbol, item.market || marketHint);
  return {
    symbol,
    market,
    name: item.name || item.title || displaySymbol(symbol, market),
    venue: item.venue || (market === 'CRYPTO' ? 'CRYPTO' : 'US'),
    source: item.source || 'reference',
    hint: item.hint || null
  };
}

function buildSignalCards(signals, locale, isZh) {
  return (signals || []).slice(0, 4).map((signal, index) => {
    const symbol = normalizeSymbol(signal?.symbol || signal?.ticker || `SIG${index + 1}`);
    const market = guessMarket(symbol, signal?.market);
    const confidence = toNumber(signal?.confidence) ?? null;
    const direction = String(signal?.direction || signal?.side || (isZh ? '观察' : 'Watch'));
    return {
      id: `${symbol}-${index}`,
      symbol,
      market,
      title: `${symbol} ${direction}`,
      note:
        signal?.thesis ||
        signal?.why ||
        signal?.summary ||
        (isZh ? '从 Today 行动卡派生的观察上下文。' : 'Pulled from the Today action stack.'),
      confidence: confidence !== null ? `${isZh ? '置信度' : 'Conf'} ${formatNumber(confidence, 0, locale)}` : null
    };
  });
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="browse-v2-search-icon" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="M12.5 12.5L16.25 16.25" />
    </svg>
  );
}

function MiniLine({ values, tone = 'neutral', width = 240, height = 88, className = '' }) {
  const d = useMemo(() => chartPath(values, width, height), [height, values, width]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`browse-v2-line browse-v2-line-${tone} ${className}`.trim()} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function MarketCard({ item, locale, onOpen }) {
  return (
    <button type="button" className="browse-v2-card" onClick={() => onOpen(item.selection)}>
      <div className="browse-v2-card-head">
        <div>
          <p className="browse-v2-card-symbol">{displaySymbol(item.symbol, item.market)}</p>
          <p className="browse-v2-card-name">{item.name}</p>
        </div>
        <span className={`browse-v2-badge browse-v2-badge-${item.market === 'CRYPTO' ? 'crypto' : 'stock'}`}>
          {item.market === 'CRYPTO' ? 'Crypto' : 'US'}
        </span>
      </div>
      <MiniLine values={item.values} tone={toneClass(item.change)} />
      <div className="browse-v2-card-foot">
        <span className="browse-v2-card-price">{compactPrice(item.latest, locale)}</span>
        <span className={`browse-v2-card-change ${toneClass(item.change)}`}>{percentText(item.change, locale)}</span>
      </div>
    </button>
  );
}

function ResultRow({ item, locale, isZh, onOpen }) {
  return (
    <button type="button" className="browse-v2-row" onClick={() => onOpen(buildSelection(item, item.market))}>
      <div className="browse-v2-row-copy">
        <div className="browse-v2-row-head">
          <p className="browse-v2-row-symbol">{displaySymbol(item.symbol, item.market)}</p>
          <div className="browse-v2-row-tags">
            <span className="browse-v2-badge">{item.market === 'CRYPTO' ? (isZh ? '加密' : 'Crypto') : isZh ? '美股' : 'US'}</span>
            <span className="browse-v2-badge browse-v2-badge-muted">{item.source || 'reference'}</span>
          </div>
        </div>
        <p className="browse-v2-row-name">{item.name || item.hint || item.symbol}</p>
        {item.hint ? <p className="browse-v2-row-hint">{item.hint}</p> : null}
      </div>
      <span className="browse-v2-row-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function NewsRow({ item, locale, onOpen, isZh }) {
  return (
    <article className="browse-v2-news-row">
      <button type="button" className="browse-v2-news-main" onClick={() => onOpen(buildSelection(item, item.market))}>
        <div className="browse-v2-news-head">
          <span className="browse-v2-news-symbol">{displaySymbol(item.symbol, item.market)}</span>
          <span className="browse-v2-news-source">{item.source || (isZh ? '来源' : 'Source')}</span>
        </div>
        <h3 className="browse-v2-news-title">{item.headline || '--'}</h3>
        <p className="browse-v2-news-meta">{formatAsOf(item.publishedAt, locale)}</p>
      </button>
      {item.url ? (
        <a className="browse-v2-inline-link" href={item.url} target="_blank" rel="noreferrer">
          {isZh ? '原文' : 'Open'}
        </a>
      ) : null}
    </article>
  );
}

function StatCard({ label, value, note }) {
  return (
    <article className="browse-v2-stat">
      <p className="browse-v2-stat-label">{label}</p>
      <p className="browse-v2-stat-value">{value}</p>
      {note ? <p className="browse-v2-stat-note">{note}</p> : null}
    </article>
  );
}

function PillButton({ active, children, onClick }) {
  return (
    <button type="button" className={`browse-v2-pill ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function BrowseTab({
  locale,
  marketInstruments = [],
  signals = [],
  insights = {},
  watchlist = [],
  setWatchlist,
  onOpenMy
}) {
  const isZh = locale?.startsWith('zh');
  const copy = useMemo(
    () => ({
      title: isZh ? '发现' : 'Browse',
      subtitle: isZh ? '搜索任意股票或加密货币，然后直接进入详情。' : 'Search any stock or crypto, then open the detail view directly.',
      searchPlaceholder: isZh ? '搜索股票、ETF、公司名或加密货币' : 'Search stocks, ETFs, companies, or crypto',
      marketTitle: isZh ? '市场' : 'Market',
      watchlistTitle: isZh ? '观察列表' : 'Watchlist',
      watchlistEmpty: isZh ? '把标的加入观察列表后，这里会显示你的快捷入口。' : 'Add symbols to your watchlist to pin them here.',
      openMy: isZh ? '打开我的列表' : 'Open My',
      searchResults: isZh ? '搜索结果' : 'Results',
      searching: isZh ? '正在搜索…' : 'Searching…',
      searchError: isZh ? '搜索暂时不可用，请稍后再试。' : 'Search is temporarily unavailable right now.',
      noResults: isZh ? '没有找到结果，试试 ticker、公司名或币名。' : 'No matches yet. Try a ticker, company name, or coin name.',
      marketOverview: isZh ? '市场概览' : 'Market overview',
      topMoves: isZh ? '主要异动' : 'Top moves',
      latestNews: isZh ? '最新新闻' : 'Latest news',
      fromToday: isZh ? '来自 Today 的线索' : 'From Today',
      emptyNews: isZh ? '暂时没有可展示的新闻。' : 'No news feed is available right now.',
      back: isZh ? '返回浏览' : 'Back to browse',
      todayChart: isZh ? '今天走势' : "Today's chart",
      stats: isZh ? '关键统计' : 'Key stats',
      fundamentals: isZh ? '基本面 / 概览' : 'Basics',
      relatedEtfs: isZh ? '相关 ETF' : 'Related ETFs',
      derivatives: isZh ? '期权 / 衍生品' : 'Options / derivatives',
      topNews: isZh ? '相关新闻' : 'Top news',
      addWatch: isZh ? '加入观察列表' : 'Add to watchlist',
      removeWatch: isZh ? '移出观察列表' : 'Remove from watchlist',
      loading: isZh ? '正在加载…' : 'Loading…',
      detailError: isZh ? '这只标的的详情暂时不可用。' : 'This asset detail is temporarily unavailable.',
      source: isZh ? '来源' : 'Source',
      updated: isZh ? '更新时间' : 'Updated',
      dayRange: isZh ? '区间' : 'Range',
      points: isZh ? '点数' : 'Points',
      latest: isZh ? '最新价' : 'Last',
      change: isZh ? '涨跌幅' : 'Change',
      tradingVenue: isZh ? '交易场所' : 'Venue',
      quoteCurrency: isZh ? '计价货币' : 'Currency',
      earnings: isZh ? '事件窗口' : 'Event window',
      relatedOpen: isZh ? '打开' : 'Open',
      signalsEmpty: isZh ? '当前没有足够清晰的 Today 线索。' : 'No strong Today ideas to surface right now.',
      regimes:
        insights?.market_regime?.label ||
        insights?.marketState?.label ||
        (isZh ? '等待更多市场确认' : 'Waiting for stronger market confirmation')
    }),
    [insights, isZh]
  );

  const [marketTab, setMarketTab] = useState('US');
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState('idle');
  const [searchResults, setSearchResults] = useState([]);
  const [homeState, setHomeState] = useState({ loading: true, items: [], error: '' });
  const [newsState, setNewsState] = useState({ loading: true, items: [] });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [detailRange, setDetailRange] = useState('1D');
  const [detailState, setDetailState] = useState({
    loading: false,
    error: '',
    values: [],
    latest: null,
    change: null,
    low: null,
    high: null,
    asOf: null,
    source: null,
    sourceStatus: null,
    resolvedSymbol: null
  });
  const [detailOverview, setDetailOverview] = useState(null);
  const [detailNews, setDetailNews] = useState([]);

  const normalizedWatchlist = useMemo(
    () => (watchlist || []).map((item) => normalizeSymbol(item)).filter(Boolean),
    [watchlist]
  );

  const signalCards = useMemo(() => buildSignalCards(signals, locale, isZh), [signals, locale, isZh]);

  const marketTargets = useMemo(() => {
    const preferred = [];
    normalizedWatchlist.forEach((symbol) => {
      if (guessMarket(symbol) === marketTab) preferred.push(symbol);
    });
    signalCards.forEach((item) => {
      if (item.market === marketTab) preferred.push(item.symbol);
    });
    MARKET_PRESETS[marketTab].forEach((symbol) => preferred.push(symbol));
    return Array.from(new Set(preferred)).slice(0, 8);
  }, [marketTab, normalizedWatchlist, signalCards]);

  useEffect(() => {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      setSearchState('idle');
      setSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchState('loading');
      try {
        const payload = await fetchApiJson(`/api/assets/search?q=${encodeURIComponent(trimmed)}&limit=16`);
        if (cancelled) return;
        setSearchResults(Array.isArray(payload?.data) ? payload.data : []);
        setSearchState('ready');
      } catch {
        if (cancelled) return;
        setSearchResults([]);
        setSearchState('error');
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setHomeState((current) => ({ ...current, loading: true, error: '' }));

    Promise.allSettled(
      marketTargets.map(async (symbol) => {
        const local = (marketInstruments || []).find((item) => normalizeSymbol(item?.ticker || item?.symbol) === symbol);
        if (local && Array.isArray(local?.bars) && local.bars.length >= 2) {
          const values = local.bars
            .slice(-24)
            .map((bar) => toNumber(bar?.close))
            .filter((value) => Number.isFinite(value));
          const first = values[0] ?? null;
          const latest = values[values.length - 1] ?? null;
          return {
            symbol,
            market: marketTab,
            name: local?.name || symbol,
            latest,
            change: latest !== null && first ? (latest - first) / first : null,
            values,
            asOf: local?.bars?.[local.bars.length - 1]?.date || null,
            source: 'runtime',
            selection: buildSelection({ symbol, market: marketTab, name: local?.name, source: 'live' }, marketTab)
          };
        }

        const chart = await fetchApiJson(`/api/browse/chart?market=${marketTab}&symbol=${encodeURIComponent(symbol)}`);
        const values = Array.isArray(chart?.points)
          ? chart.points.map((point) => toNumber(point?.close)).filter((value) => Number.isFinite(value))
          : [];
        return {
          symbol,
          market: marketTab,
          name: chart?.name || displaySymbol(symbol, marketTab),
          latest: toNumber(chart?.latest),
          change: toNumber(chart?.change),
          values,
          asOf: chart?.asOf || null,
          source: chart?.source || null,
          selection: buildSelection(
            {
              symbol: chart?.resolvedSymbol || symbol,
              market: marketTab,
              name: chart?.name || displaySymbol(symbol, marketTab),
              venue: chart?.venue || null,
              source: 'live'
            },
            marketTab
          )
        };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const items = results
          .filter((result) => result.status === 'fulfilled' && result.value?.selection)
          .map((result) => result.value);
        setHomeState({
          loading: false,
          items,
          error: items.length ? '' : copy.detailError
        });
      })
      .catch(() => {
        if (cancelled) return;
        setHomeState({
          loading: false,
          items: [],
          error: copy.detailError
        });
      });

    return () => {
      cancelled = true;
    };
  }, [copy.detailError, marketInstruments, marketTab, marketTargets]);

  useEffect(() => {
    let cancelled = false;
    setNewsState({ loading: true, items: [] });
    fetchApiJson(`/api/browse/news?market=${marketTab}&limit=6`)
      .then((payload) => {
        if (cancelled) return;
        setNewsState({
          loading: false,
          items: Array.isArray(payload?.data) ? payload.data : []
        });
      })
      .catch(() => {
        if (cancelled) return;
        setNewsState({ loading: false, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [marketTab]);

  useEffect(() => {
    if (!selectedAsset) {
      setDetailState({
        loading: false,
        error: '',
        values: [],
        latest: null,
        change: null,
        low: null,
        high: null,
        asOf: null,
        source: null,
        sourceStatus: null,
        resolvedSymbol: null
      });
      setDetailOverview(null);
      setDetailNews([]);
      return undefined;
    }

    let cancelled = false;
    const config = DETAIL_RANGES[detailRange];
    setDetailState((current) => ({
      ...current,
      loading: true,
      error: '',
      values: []
    }));

    const chartPromise = config.live
      ? fetchApiJson(`/api/browse/chart?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}`)
      : fetchApiJson(
          `/api/ohlcv?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}&tf=${config.tf}&limit=${config.limit}`
        );

    Promise.all([
      chartPromise,
      fetchApiJson(`/api/browse/overview?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}`).catch(() => null),
      fetchApiJson(`/api/browse/news?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}&limit=6`).catch(() => null)
    ])
      .then(([chartPayload, overviewPayload, newsPayload]) => {
        if (cancelled) return;
        const values = config.live
          ? Array.isArray(chartPayload?.points)
            ? chartPayload.points.map((point) => toNumber(point?.close)).filter((value) => Number.isFinite(value))
            : []
          : Array.isArray(chartPayload?.data)
            ? chartPayload.data.map((row) => toNumber(row?.close)).filter((value) => Number.isFinite(value))
            : [];
        const first = values[0] ?? null;
        const latest = config.live ? toNumber(chartPayload?.latest) : values[values.length - 1] ?? null;
        const change = config.live
          ? toNumber(chartPayload?.change)
          : latest !== null && first ? (latest - first) / first : null;
        const low = values.length ? Math.min(...values) : null;
        const high = values.length ? Math.max(...values) : null;
        setDetailState({
          loading: false,
          error: values.length ? '' : copy.detailError,
          values,
          latest,
          change,
          low,
          high,
          asOf: config.live
            ? chartPayload?.asOf || null
            : chartPayload?.data?.length
              ? new Date(Number(chartPayload.data[chartPayload.data.length - 1]?.ts_open || Date.now())).toISOString()
              : null,
          source: config.live ? chartPayload?.source || null : 'Historical OHLCV',
          sourceStatus: config.live ? chartPayload?.sourceStatus || null : 'CACHED',
          resolvedSymbol: config.live ? chartPayload?.resolvedSymbol || selectedAsset.symbol : selectedAsset.symbol
        });
        setDetailOverview(overviewPayload || null);
        setDetailNews(Array.isArray(newsPayload?.data) ? newsPayload.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailState({
          loading: false,
          error: copy.detailError,
          values: [],
          latest: null,
          change: null,
          low: null,
          high: null,
          asOf: null,
          source: null,
          sourceStatus: null,
          resolvedSymbol: null
        });
        setDetailOverview(null);
        setDetailNews([]);
      });

    return () => {
      cancelled = true;
    };
  }, [copy.detailError, detailRange, selectedAsset]);

  const movers = useMemo(() => {
    return [...homeState.items]
      .filter((item) => Number.isFinite(item.change))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 6);
  }, [homeState.items]);

  const watchlistCards = useMemo(() => {
    const watchMatches = homeState.items.filter((item) => normalizedWatchlist.includes(item.symbol));
    return watchMatches.slice(0, 6);
  }, [homeState.items, normalizedWatchlist]);

  const isWatched = selectedAsset ? normalizedWatchlist.includes(normalizeSymbol(selectedAsset.symbol)) : false;

  function openSelection(selection) {
    const next = buildSelection(selection, selection?.market);
    if (!next) return;
    setSelectedAsset(next);
    setDetailRange('1D');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function toggleWatchlist() {
    if (!selectedAsset || typeof setWatchlist !== 'function') return;
    const symbol = normalizeSymbol(selectedAsset.symbol);
    setWatchlist((current) => {
      const currentList = Array.isArray(current) ? current.map((item) => normalizeSymbol(item)).filter(Boolean) : [];
      if (currentList.includes(symbol)) {
        return currentList.filter((item) => item !== symbol);
      }
      return [...currentList, symbol];
    });
  }

  function renderHome() {
    return (
      <section className="stack-gap browse-v2">
        <header className="browse-v2-header">
          <div>
            <p className="browse-v2-kicker">{copy.marketTitle}</p>
            <h1 className="browse-v2-title">{copy.title}</h1>
            <p className="browse-v2-subtitle">{copy.subtitle}</p>
          </div>
          <div className="browse-v2-regime">{copy.regimes}</div>
        </header>

        <section className="browse-v2-search-shell">
          <SearchIcon />
          <input
            className="browse-v2-search-input"
            type="search"
            inputMode="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
          {query ? (
            <button type="button" className="browse-v2-clear" onClick={() => setQuery('')}>
              ×
            </button>
          ) : null}
        </section>

        <div className="browse-v2-tab-row" role="tablist" aria-label={copy.marketTitle}>
          <PillButton active={marketTab === 'US'} onClick={() => setMarketTab('US')}>
            US
          </PillButton>
          <PillButton active={marketTab === 'CRYPTO'} onClick={() => setMarketTab('CRYPTO')}>
            Crypto
          </PillButton>
        </div>

        {query.trim() ? (
          <section className="browse-v2-section">
            <div className="browse-v2-section-head">
              <h2>{copy.searchResults}</h2>
            </div>
            {searchState === 'loading' ? <div className="browse-v2-empty">{copy.searching}</div> : null}
            {searchState === 'error' ? <div className="browse-v2-empty">{copy.searchError}</div> : null}
            {searchState === 'ready' && !searchResults.length ? <div className="browse-v2-empty">{copy.noResults}</div> : null}
            {searchResults.length ? (
              <div className="browse-v2-list">
                {searchResults.map((item) => (
                  <ResultRow key={`${item.market}-${item.symbol}`} item={item} locale={locale} isZh={isZh} onOpen={openSelection} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.watchlistTitle}</h2>
            <button type="button" className="browse-v2-inline-link" onClick={onOpenMy}>
              {copy.openMy}
            </button>
          </div>
          {watchlistCards.length ? (
            <div className="browse-v2-chip-row">
              {watchlistCards.map((item) => (
                <button key={`watch-${item.symbol}`} type="button" className="browse-v2-chip" onClick={() => openSelection(item.selection)}>
                  <span>{displaySymbol(item.symbol, item.market)}</span>
                  <span className={toneClass(item.change)}>{percentText(item.change, locale)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="browse-v2-empty">{copy.watchlistEmpty}</div>
          )}
        </section>

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.marketOverview}</h2>
          </div>
          {homeState.loading ? <div className="browse-v2-empty">{copy.loading}</div> : null}
          {!homeState.loading && homeState.error ? <div className="browse-v2-empty">{homeState.error}</div> : null}
          {homeState.items.length ? (
            <div className="browse-v2-grid">
              {homeState.items.map((item) => (
                <MarketCard key={`${item.market}-${item.symbol}`} item={item} locale={locale} onOpen={openSelection} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.topMoves}</h2>
          </div>
          {movers.length ? (
            <div className="browse-v2-list">
              {movers.map((item) => (
                <button key={`move-${item.symbol}`} type="button" className="browse-v2-row" onClick={() => openSelection(item.selection)}>
                  <div className="browse-v2-row-copy">
                    <div className="browse-v2-row-head">
                      <p className="browse-v2-row-symbol">{displaySymbol(item.symbol, item.market)}</p>
                      <span className={`browse-v2-move ${toneClass(item.change)}`}>{percentText(item.change, locale)}</span>
                    </div>
                    <p className="browse-v2-row-name">{item.name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="browse-v2-empty">{copy.loading}</div>
          )}
        </section>

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.fromToday}</h2>
          </div>
          {signalCards.length ? (
            <div className="browse-v2-signal-list">
              {signalCards.map((item) => (
                <button key={item.id} type="button" className="browse-v2-signal-card" onClick={() => openSelection(item)}>
                  <div className="browse-v2-signal-head">
                    <p className="browse-v2-signal-title">{item.title}</p>
                    {item.confidence ? <span className="browse-v2-badge browse-v2-badge-muted">{item.confidence}</span> : null}
                  </div>
                  <p className="browse-v2-signal-note">{item.note}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="browse-v2-empty">{copy.signalsEmpty}</div>
          )}
        </section>

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.latestNews}</h2>
          </div>
          {newsState.loading ? <div className="browse-v2-empty">{copy.loading}</div> : null}
          {!newsState.loading && !newsState.items.length ? <div className="browse-v2-empty">{copy.emptyNews}</div> : null}
          {newsState.items.length ? (
            <div className="browse-v2-news-list">
              {newsState.items.map((item) => (
                <NewsRow key={item.id || `${item.symbol}-${item.headline}`} item={item} locale={locale} onOpen={openSelection} isZh={isZh} />
              ))}
            </div>
          ) : null}
        </section>
      </section>
    );
  }

  function renderDetail() {
    const chartTone = toneClass(detailState.change);
    const detailName = detailOverview?.name || selectedAsset?.name || displaySymbol(selectedAsset?.symbol, selectedAsset?.market);
    return (
      <section className="stack-gap browse-v2 browse-v2-detail">
        <button type="button" className="browse-v2-back" onClick={() => setSelectedAsset(null)}>
          ← {copy.back}
        </button>

        <section className="browse-v2-detail-hero">
          <div className="browse-v2-detail-head">
            <div>
              <p className="browse-v2-kicker">{selectedAsset.market === 'CRYPTO' ? 'CRYPTO' : 'US'}</p>
              <h1 className="browse-v2-detail-symbol">{displaySymbol(selectedAsset.symbol, selectedAsset.market)}</h1>
              <p className="browse-v2-detail-name">{detailName}</p>
            </div>
            <button type="button" className={`browse-v2-watch ${isWatched ? 'active' : ''}`} onClick={toggleWatchlist}>
              {isWatched ? copy.removeWatch : copy.addWatch}
            </button>
          </div>

          <div className="browse-v2-range-row" role="tablist" aria-label={copy.todayChart}>
            {Object.keys(DETAIL_RANGES).map((range) => (
              <PillButton key={range} active={detailRange === range} onClick={() => setDetailRange(range)}>
                {range}
              </PillButton>
            ))}
          </div>

          <div className="browse-v2-chart-panel">
            {detailState.loading ? <div className="browse-v2-empty">{copy.loading}</div> : null}
            {!detailState.loading && detailState.error ? <div className="browse-v2-empty">{detailState.error}</div> : null}
            {!detailState.loading && detailState.values.length ? (
              <>
                <div className="browse-v2-chart-head">
                  <div>
                    <p className="browse-v2-chart-price">{compactPrice(detailState.latest, locale)}</p>
                    <p className={`browse-v2-chart-change ${chartTone}`}>{percentText(detailState.change, locale)}</p>
                  </div>
                  <div className="browse-v2-chart-meta">
                    <span>{copy.source}: {detailState.source || '--'}</span>
                    <span>{copy.updated}: {formatAsOf(detailState.asOf, locale)}</span>
                  </div>
                </div>
                <MiniLine values={detailState.values} tone={chartTone} width={320} height={150} className="browse-v2-chart-line" />
              </>
            ) : null}
          </div>
        </section>

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.stats}</h2>
          </div>
          <div className="browse-v2-stats">
            <StatCard label={copy.latest} value={compactPrice(detailState.latest, locale)} />
            <StatCard label={copy.change} value={percentText(detailState.change, locale)} />
            <StatCard label={copy.dayRange} value={rangeText(detailState.low, detailState.high, locale)} />
            <StatCard label={copy.points} value={String(detailState.values.length || '--')} />
            <StatCard label={copy.tradingVenue} value={detailOverview?.profile?.tradingVenue || selectedAsset.venue || '--'} />
            <StatCard label={copy.quoteCurrency} value={detailOverview?.profile?.quoteCurrency || '--'} />
          </div>
        </section>

        {detailOverview ? (
          <>
            <section className="browse-v2-section">
              <div className="browse-v2-section-head">
                <h2>{copy.fundamentals}</h2>
              </div>
              <div className="browse-v2-detail-list">
                {(detailOverview.fundamentals || []).map((item) => (
                  <StatCard key={`${item.label}-${item.value}`} label={item.label} value={item.value || '--'} note={item.source} />
                ))}
              </div>
            </section>

            <section className="browse-v2-section">
              <div className="browse-v2-section-head">
                <h2>{copy.relatedEtfs}</h2>
              </div>
              <div className="browse-v2-chip-row">
                {(detailOverview.relatedEtfs || []).map((symbol) => (
                  <button key={`etf-${symbol}`} type="button" className="browse-v2-chip" onClick={() => openSelection({ symbol, market: 'US' })}>
                    {symbol}
                  </button>
                ))}
              </div>
            </section>

            <section className="browse-v2-section">
              <div className="browse-v2-section-head">
                <h2>{copy.derivatives}</h2>
              </div>
              <div className="browse-v2-detail-list">
                {(detailOverview.optionEntries || []).map((item) => (
                  <StatCard key={`${item.label}-${item.description}`} label={item.label} value={item.description} />
                ))}
              </div>
            </section>

            <section className="browse-v2-section">
              <div className="browse-v2-section-head">
                <h2>{copy.earnings}</h2>
              </div>
              <div className="browse-v2-detail-list">
                <StatCard label={detailOverview.earnings?.status || '--'} value={detailOverview.earnings?.note || '--'} />
              </div>
            </section>
          </>
        ) : null}

        <section className="browse-v2-section">
          <div className="browse-v2-section-head">
            <h2>{copy.topNews}</h2>
          </div>
          {detailNews.length ? (
            <div className="browse-v2-news-list">
              {detailNews.map((item) => (
                <NewsRow key={item.id || `${item.symbol}-${item.headline}`} item={item} locale={locale} onOpen={openSelection} isZh={isZh} />
              ))}
            </div>
          ) : (
            <div className="browse-v2-empty">{copy.emptyNews}</div>
          )}
        </section>
      </section>
    );
  }

  return selectedAsset ? renderDetail() : renderHome();
}

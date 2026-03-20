import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';
import { fetchApiJson } from '../utils/api';

const CATEGORY_KEYS = ['STOCK', 'CRYPTO'];
const DETAIL_RANGES = ['1D', '1W', '1M', '3M'];
const HOME_POLL_MS = 1000;
const DETAIL_POLL_MS = 1000;
const DETAIL_META_POLL_MS = 30000;
const CLIENT_HOME_CACHE_TTL_MS = 4000;
const DETAIL_RANGE_CONFIG = {
  '1D': { live: true },
  '1W': { tf: '1d', limit: 7 },
  '1M': { tf: '1d', limit: 30 },
  '3M': { tf: '1d', limit: 90 }
};
const homeClientCache = new Map();

function getCachedHomePayload(view) {
  const hit = homeClientCache.get(view);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    homeClientCache.delete(view);
    return null;
  }
  return hit.data;
}

function writeCachedHomePayload(view, data) {
  homeClientCache.set(view, {
    expiresAt: Date.now() + CLIENT_HOME_CACHE_TTL_MS,
    data
  });
}

function buildInitialHomeState() {
  return CATEGORY_KEYS.reduce((acc, key) => {
    const cached = getCachedHomePayload(key);
    acc[key] = {
      loading: !cached,
      error: '',
      data: cached
    };
    return acc;
  }, {});
}

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

function displaySymbol(symbol, market) {
  const upper = normalizeSymbol(symbol);
  if (market === 'CRYPTO') return upper.replace(/USDT$/, '').replace(/USD$/, '') || upper;
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
    minute: '2-digit',
    second: '2-digit'
  });
}

function toneClass(value) {
  if (!Number.isFinite(value)) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function chartPath(values, width = 228, height = 74) {
  const safe = (values || []).filter((value) => Number.isFinite(value));
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="browse-rh-search-icon" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.25" />
      <path d="M12.5 12.5L16.25 16.25" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" className="browse-rh-chevron" aria-hidden="true">
      <path d="M5.5 7.5L10 12L14.5 7.5" />
    </svg>
  );
}

function MiniChart({ values, tone = 'neutral', width = 228, height = 74, className = '' }) {
  const d = useMemo(() => chartPath(values, width, height), [height, values, width]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`browse-rh-chart browse-rh-chart-${tone} ${className}`.trim()} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function InfoDot() {
  return <span className="browse-rh-info-dot">i</span>;
}

function SectionHeader({ title, action, onAction }) {
  return (
    <div className="browse-rh-section-head">
      <div className="browse-rh-section-title-wrap">
        <h2>{title}</h2>
        <InfoDot />
      </div>
      {action ? (
        <button type="button" className="browse-rh-section-action" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

function MarketCard({ item, locale, onOpen }) {
  return (
    <button type="button" className="browse-rh-market-card" onClick={() => onOpen(item)}>
      <div className="browse-rh-market-card-copy">
        <p className="browse-rh-market-card-title">{item.title}</p>
        <p className="browse-rh-market-card-subtitle">{item.subtitle}</p>
      </div>
      <div className="browse-rh-market-card-chart">
        <MiniChart values={item.values} tone={toneClass(item.change)} />
      </div>
      <p className="browse-rh-market-card-price">{compactPrice(item.latest, locale)}</p>
      <p className={`browse-rh-market-card-change ${toneClass(item.change)}`}>{percentText(item.change, locale)}</p>
    </button>
  );
}

function MoverChip({ item, locale, onOpen }) {
  return (
    <button type="button" className="browse-rh-mover-chip" onClick={() => onOpen(item)}>
      <span className="browse-rh-mover-symbol">{displaySymbol(item.symbol, item.market)}</span>
      <span className={`browse-rh-mover-change ${toneClass(item.change)}`}>{percentText(item.change, locale)}</span>
    </button>
  );
}

function EarningsRow({ item, onOpen }) {
  return (
    <button type="button" className="browse-rh-earnings-row" onClick={() => onOpen(item)}>
      <div className="browse-rh-earnings-copy">
        <p className="browse-rh-earnings-symbol">{item.symbol}</p>
        <p className="browse-rh-earnings-note">{item.note}</p>
      </div>
      <span className="browse-rh-earnings-timing">{item.timing}</span>
    </button>
  );
}

function ScreenerRow({ item, index, onOpen }) {
  const accentClass = index % 3 === 0 ? 'green' : index % 3 === 1 ? 'amber' : 'gold';
  return (
    <button type="button" className="browse-rh-screener-row" onClick={() => onOpen(item)}>
      <span className={`browse-rh-screener-icon ${accentClass}`} aria-hidden="true">
        ↗
      </span>
      <div className="browse-rh-screener-copy">
        <p className="browse-rh-screener-title">{item.title}</p>
        <p className="browse-rh-screener-subtitle">{item.subtitle}</p>
      </div>
      <span className="browse-rh-screener-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function TrendChip({ item, onOpen }) {
  return (
    <button type="button" className="browse-rh-trend-chip" onClick={() => onOpen(item)}>
      <span className="browse-rh-trend-icon" aria-hidden="true" />
      <span className="browse-rh-trend-title">{item.title}</span>
    </button>
  );
}

function ResultRow({ item, locale, onOpen }) {
  return (
    <button type="button" className="browse-rh-result-row" onClick={() => onOpen(item)}>
      <div className="browse-rh-result-copy">
        <div className="browse-rh-result-head">
          <p className="browse-rh-result-symbol">{displaySymbol(item.symbol, item.market)}</p>
          <span className="browse-rh-result-market">{item.market}</span>
        </div>
        <p className="browse-rh-result-name">{item.name || item.symbol}</p>
        {item.hint ? <p className="browse-rh-result-hint">{item.hint}</p> : null}
      </div>
      <span className="browse-rh-result-side">{item.latest !== null ? compactPrice(item.latest, locale) : '›'}</span>
    </button>
  );
}

function NewsRow({ item, locale, onOpen }) {
  return (
    <article className="browse-rh-news-row">
      <button type="button" className="browse-rh-news-main" onClick={() => onOpen(item)}>
        <div className="browse-rh-news-head">
          <span className="browse-rh-news-symbol">{displaySymbol(item.symbol, item.market)}</span>
          <span className="browse-rh-news-source">{item.source || '--'}</span>
        </div>
        <h3 className="browse-rh-news-title">{item.headline}</h3>
        <p className="browse-rh-news-time">{formatAsOf(item.publishedAt, locale)}</p>
      </button>
      {item.url ? (
        <a className="browse-rh-news-link" href={item.url} target="_blank" rel="noreferrer">
          Open
        </a>
      ) : null}
    </article>
  );
}

function DetailStat({ label, value, note }) {
  return (
    <article className="browse-rh-detail-stat">
      <p className="browse-rh-detail-stat-label">{label}</p>
      <p className="browse-rh-detail-stat-value">{value}</p>
      {note ? <p className="browse-rh-detail-stat-note">{note}</p> : null}
    </article>
  );
}

function buildSelection(item) {
  if (!item) return null;
  return {
    symbol: normalizeSymbol(item.symbol || item.resolvedSymbol),
    market: String(item.market || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US',
    name: item.name || item.title || normalizeSymbol(item.symbol),
    title: item.title || item.name || normalizeSymbol(item.symbol),
    subtitle: item.subtitle || null
  };
}

function isPageVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export default function BrowseTab({
  locale,
  signals = [],
  watchlist = [],
  setWatchlist,
  topBarBackToken = 0,
  onTopBarStateChange
}) {
  const isZh = locale?.startsWith('zh');
  const copy = useMemo(
    () => ({
      title: isZh ? '发现' : 'Browse',
      searchPlaceholder: isZh ? '搜索股票或加密货币' : 'Search stocks or crypto',
      categories: {
        STOCK: isZh ? '股票' : 'Stock',
        CRYPTO: isZh ? '加密' : 'Crypto'
      },
      featured: isZh ? '精选标的' : 'Featured choices',
      topMovers: isZh ? '涨跌榜' : 'Top movers',
      earnings: isZh ? '财报关注' : 'Earnings',
      showMore: isZh ? '查看更多' : 'Show more',
      screeners: isZh ? '股票筛选器' : 'Stock screeners',
      create: isZh ? '创建' : 'Create',
      trending: isZh ? '趋势列表' : 'Trending lists',
      results: isZh ? '搜索结果' : 'Results',
      searching: isZh ? '搜索中…' : 'Searching…',
      noResults: isZh ? '没有找到结果。' : 'No results.',
      searchError: isZh ? '搜索暂时不可用。' : 'Search is temporarily unavailable.',
      searchNoUniverse: isZh ? '搜索资产库还没有准备好。' : 'The searchable asset universe is not ready yet.',
      searchNoMatches: isZh ? '有资产库，但这次查询没有命中。' : 'The asset universe is available, but this query did not match anything.',
      back: isZh ? '返回' : 'Back',
      loading: isZh ? '加载中…' : 'Loading…',
      detailError: isZh ? '详情暂时不可用。' : 'Detail is unavailable.',
      relatedEtfs: isZh ? '相关 ETF' : 'Related ETFs',
      derivatives: isZh ? '期权 / 衍生品' : 'Options / derivatives',
      fundamentals: isZh ? '基本面 / 概览' : 'Basics',
      topNews: isZh ? '相关新闻' : 'Top news',
      addWatch: isZh ? '加入观察列表' : 'Add to watchlist',
      removeWatch: isZh ? '移出观察列表' : 'Remove from watchlist',
      latest: isZh ? '最新价' : 'Last',
      change: isZh ? '涨跌幅' : 'Change',
      range: isZh ? '区间' : 'Range',
      points: isZh ? '点数' : 'Points',
      source: isZh ? '来源' : 'Source',
      updated: isZh ? '更新时间' : 'Updated',
      venue: isZh ? '市场' : 'Venue',
      currency: isZh ? '货币' : 'Currency'
    }),
    [isZh]
  );

  const [category, setCategory] = useState('STOCK');
  const [homeStateByCategory, setHomeStateByCategory] = useState(() => buildInitialHomeState());
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState('idle');
  const [searchResults, setSearchResults] = useState([]);
  const [searchHealth, setSearchHealth] = useState(null);
  const [activeList, setActiveList] = useState(null);
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
    source: null
  });
  const [detailOverview, setDetailOverview] = useState(null);
  const [detailNews, setDetailNews] = useState([]);
  const selectedKey = selectedAsset ? `${selectedAsset.market}:${selectedAsset.symbol}` : '';
  const watchedSymbols = useMemo(() => (watchlist || []).map((item) => normalizeSymbol(item)), [watchlist]);
  const todaySignalSymbols = useMemo(
    () =>
      (signals || [])
        .slice(0, 4)
        .map((signal) => ({
          symbol: normalizeSymbol(signal?.symbol || signal?.ticker),
          market: String(signal?.market || '').toUpperCase() === 'CRYPTO' ? 'CRYPTO' : 'US',
          title: signal?.thesis || signal?.summary || signal?.why || 'Today signal'
        }))
        .filter((item) => item.symbol),
    [signals]
  );

  useEffect(() => {
    if (typeof onTopBarStateChange !== 'function') return;
    onTopBarStateChange({
      canGoBack: Boolean(selectedAsset || activeList),
      title: selectedAsset
        ? displaySymbol(selectedAsset.symbol, selectedAsset.market)
        : activeList?.title || copy.title,
      backLabel: copy.title
    });
  }, [activeList, copy.title, onTopBarStateChange, selectedAsset]);

  const homeState = homeStateByCategory[category] || { loading: true, error: '', data: null };

  useEffect(() => {
    if (!topBarBackToken) return;
    if (selectedAsset) {
      setSelectedAsset(null);
      return;
    }
    if (activeList) {
      setActiveList(null);
    }
  }, [activeList, selectedAsset, topBarBackToken]);

  useEffect(() => {
    if (query.trim() || selectedAsset || activeList) return undefined;

    let cancelled = false;
    const inFlight = new Map();
    const loadHome = async (view, initial = false) => {
      if (inFlight.has(view)) return inFlight.get(view);
      if (initial) {
        setHomeStateByCategory((current) => {
          const next = current[view] || { loading: true, error: '', data: null };
          return {
            ...current,
            [view]: {
              loading: !next.data,
              error: '',
              data: next.data
            }
          };
        });
      }
      const request = (async () => {
      try {
          const payload = await fetchApiJson(`/api/browse/home?view=${view}`, { cache: 'no-store' });
        if (cancelled) return;
          writeCachedHomePayload(view, payload || null);
          setHomeStateByCategory((current) => ({
            ...current,
            [view]: {
              loading: false,
              error: '',
              data: payload || null
            }
          }));
      } catch {
        if (cancelled) return;
          setHomeStateByCategory((current) => {
            const prev = current[view] || { loading: false, error: '', data: null };
            return {
              ...current,
              [view]: prev.data
                ? { ...prev, loading: false }
                : { loading: false, error: copy.detailError, data: null }
            };
          });
      } finally {
          inFlight.delete(view);
        }
      })();
      inFlight.set(view, request);
      return request;
    };

    void loadHome(category, true).then(() => {
      const inactiveViews = CATEGORY_KEYS.filter((view) => view !== category && !getCachedHomePayload(view));
      inactiveViews.forEach((view) => {
        void loadHome(view, false);
      });
    });
    const intervalId = window.setInterval(() => {
      if (!isPageVisible()) return;
      void loadHome(category, false);
    }, HOME_POLL_MS);
    const handleVisibility = () => {
      if (!isPageVisible()) return;
      void loadHome(category, false);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeList, category, copy.detailError, query, selectedKey, selectedAsset]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchState('idle');
      setSearchResults([]);
      setSearchHealth(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchState('loading');
      try {
        const payload = await fetchApiJson(`/api/assets/search?q=${encodeURIComponent(trimmed)}&limit=18`, { cache: 'no-store' });
        if (cancelled) return;
        setSearchResults(Array.isArray(payload?.data) ? payload.data : []);
        setSearchHealth(payload?.health || null);
        setSearchState('ready');
      } catch {
        if (cancelled) return;
        setSearchResults([]);
        setSearchHealth(null);
        setSearchState('error');
      }
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

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
        source: null
      });
      setDetailOverview(null);
      setDetailNews([]);
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;
    const config = DETAIL_RANGE_CONFIG[detailRange];
    const loadChart = async (initial = false) => {
      if (inFlight) return;
      inFlight = true;
      if (initial) {
        setDetailState({
          loading: true,
          error: '',
          values: [],
          latest: null,
          change: null,
          low: null,
          high: null,
          asOf: null,
          source: null
        });
      }
      try {
        const chartPayload = config.live
          ? await fetchApiJson(`/api/browse/chart?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}`, {
              cache: 'no-store'
            })
          : await fetchApiJson(
              `/api/ohlcv?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}&tf=${config.tf}&limit=${config.limit}`,
              { cache: 'no-store' }
            );
        if (cancelled) return;
        const values = config.live
          ? (chartPayload?.points || []).map((point) => toNumber(point?.close)).filter((value) => Number.isFinite(value))
          : (chartPayload?.data || []).map((row) => toNumber(row?.close)).filter((value) => Number.isFinite(value));
        const latest = config.live ? toNumber(chartPayload?.latest) : values[values.length - 1] ?? null;
        const base = values[0] ?? null;
        setDetailState({
          loading: false,
          error: values.length ? '' : copy.detailError,
          values,
          latest,
          change: config.live ? toNumber(chartPayload?.change) : latest !== null && base ? (latest - base) / base : null,
          low: values.length ? Math.min(...values) : null,
          high: values.length ? Math.max(...values) : null,
          asOf: config.live
            ? chartPayload?.asOf || null
            : chartPayload?.data?.length
              ? new Date(Number(chartPayload.data[chartPayload.data.length - 1]?.ts_open || Date.now())).toISOString()
              : null,
          source: config.live ? chartPayload?.source || null : 'Historical OHLCV'
        });
      } catch {
        if (cancelled) return;
        setDetailState((current) =>
          current.values.length && !initial
            ? { ...current, loading: false }
            : {
                loading: false,
                error: copy.detailError,
                values: [],
                latest: null,
                change: null,
                low: null,
                high: null,
                asOf: null,
                source: null
              }
        );
      } finally {
        inFlight = false;
      }
    };

    void loadChart(true);
    let intervalId = null;
    const handleVisibility = () => {
      if (!isPageVisible()) return;
      void loadChart(false);
    };
    if (config.live) {
      intervalId = window.setInterval(() => {
        if (!isPageVisible()) return;
        void loadChart(false);
      }, DETAIL_POLL_MS);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [copy.detailError, detailRange, selectedAsset, selectedKey]);

  useEffect(() => {
    if (!selectedAsset) {
      setDetailOverview(null);
      setDetailNews([]);
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;
    const loadMeta = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [overviewPayload, newsPayload] = await Promise.all([
          fetchApiJson(`/api/browse/overview?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}`, {
            cache: 'no-store'
          }).catch(() => null),
          fetchApiJson(`/api/browse/news?market=${selectedAsset.market}&symbol=${encodeURIComponent(selectedAsset.symbol)}&limit=6`, {
            cache: 'no-store'
          }).catch(() => null)
        ]);
        if (cancelled) return;
        setDetailOverview(overviewPayload || null);
        setDetailNews(Array.isArray(newsPayload?.data) ? newsPayload.data : []);
      } finally {
        inFlight = false;
      }
    };

    void loadMeta();
    const intervalId = window.setInterval(() => {
      if (!isPageVisible()) return;
      void loadMeta();
    }, DETAIL_META_POLL_MS);
    const handleVisibility = () => {
      if (!isPageVisible()) return;
      void loadMeta();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedAsset, selectedKey]);

  function openItem(item) {
    const next = buildSelection(item);
    if (!next) return;
    setActiveList(null);
    setSelectedAsset(next);
    setDetailRange('1D');
  }

  function toggleWatch() {
    if (!selectedAsset || typeof setWatchlist !== 'function') return;
    const symbol = normalizeSymbol(selectedAsset.symbol);
    setWatchlist((current) => {
      const list = Array.isArray(current) ? current.map((item) => normalizeSymbol(item)).filter(Boolean) : [];
      return list.includes(symbol) ? list.filter((item) => item !== symbol) : [...list, symbol];
    });
  }

  function renderHome() {
    const data = homeState.data;
    const isCryptoCategory = category === 'CRYPTO';
    const moverItems = isCryptoCategory ? data?.cryptoMovers || [] : data?.topMovers || [];
    return (
      <section className="stack-gap browse-rh-screen">
        <section className="browse-rh-search-shell">
          <SearchIcon />
          <input
            type="search"
            className="browse-rh-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
        </section>

        {query.trim() ? (
          <section className="browse-rh-section">
            <SectionHeader title={copy.results} />
            {searchState === 'loading' ? <div className="browse-rh-empty">{copy.searching}</div> : null}
            {searchState === 'error' ? <div className="browse-rh-empty">{copy.searchError}</div> : null}
            {searchState === 'ready' && !searchResults.length ? <div className="browse-rh-empty">{copy.noResults}</div> : null}
            {searchState === 'ready' && !searchResults.length && searchHealth?.reason ? (
              <div className="browse-rh-empty muted">
                {searchHealth.reason === 'NO_ASSET_UNIVERSE' ? copy.searchNoUniverse : copy.searchNoMatches}
              </div>
            ) : null}
            {searchResults.length ? (
              <div className="browse-rh-list">
                {searchResults.map((item) => (
                  <ResultRow key={`${item.market}-${item.symbol}`} item={item} locale={locale} onOpen={openItem} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {!query.trim() ? (
          <>
            <div className="browse-rh-pill-row">
              {CATEGORY_KEYS.map((key) => (
                <button key={key} type="button" className={`browse-rh-pill ${category === key ? 'active' : ''}`} onClick={() => setCategory(key)}>
                  {copy.categories[key]}
                </button>
              ))}
            </div>

            {homeState.loading ? <div className="browse-rh-empty">{copy.loading}</div> : null}
            {!homeState.loading && homeState.error ? <div className="browse-rh-empty">{homeState.error}</div> : null}

            {data ? (
              <>
                <section className="browse-rh-section">
                  <SectionHeader title={copy.featured} />
                  <div className="browse-rh-market-row">
                    {(data.futuresMarkets || []).map((item) => (
                      <MarketCard key={`${item.market}-${item.symbol}`} item={item} locale={locale} onOpen={openItem} />
                    ))}
                  </div>
                </section>

                <section className="browse-rh-section">
                  <SectionHeader title={copy.topMovers} />
                  <div className="browse-rh-chip-grid">
                    {moverItems.map((item) => (
                      <MoverChip key={`move-${item.symbol}`} item={item} locale={locale} onOpen={openItem} />
                    ))}
                  </div>
                </section>

                {!isCryptoCategory ? (
                  <section className="browse-rh-section">
                    <SectionHeader title={copy.earnings} />
                    <div className="browse-rh-list">
                      {(data.earnings || []).map((item) => (
                        <EarningsRow key={`earn-${item.symbol}`} item={item} onOpen={openItem} />
                      ))}
                      {todaySignalSymbols.map((item) => (
                        <EarningsRow
                          key={`signal-${item.symbol}`}
                          item={{ ...item, note: item.title, timing: 'Today signal' }}
                          onOpen={openItem}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                <button type="button" className="browse-rh-expand" onClick={() => setActiveList({ type: 'screeners', title: copy.screeners, lists: data.screeners || [] })}>
                  <span>{copy.showMore}</span>
                  <ChevronDown />
                </button>

                <section className="browse-rh-section">
                  <SectionHeader title={copy.screeners} action={copy.create} />
                  <div className="browse-rh-list">
                    {(data.screeners || []).slice(0, 3).map((item, index) => (
                      <ScreenerRow key={item.id} item={item} index={index} onOpen={setActiveList} />
                    ))}
                  </div>
                </section>

                <button type="button" className="browse-rh-expand" onClick={() => setActiveList({ type: 'trending', title: copy.trending, lists: data.trendingLists || [] })}>
                  <span>{copy.showMore}</span>
                  <ChevronDown />
                </button>

                <section className="browse-rh-section">
                  <SectionHeader title={copy.trending} />
                  <div className="browse-rh-trend-grid">
                    {(data.trendingLists || []).map((item) => (
                      <TrendChip key={item.id} item={item} onOpen={setActiveList} />
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    );
  }

  function renderList() {
    const lists = activeList?.lists || [];
    const items = activeList?.items || [];
    return (
      <section className="stack-gap browse-rh-screen">
        {items.length ? (
          <div className="browse-rh-list">
            {items.map((item) => (
              <ResultRow key={`${item.market}-${item.symbol}`} item={item} locale={locale} onOpen={openItem} />
            ))}
          </div>
        ) : (
          <div className="browse-rh-list">
            {lists.map((item, index) => (
              <ScreenerRow key={item.id} item={item} index={index} onOpen={setActiveList} />
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderDetail() {
    const watched = watchedSymbols.includes(normalizeSymbol(selectedAsset?.symbol));
    return (
      <section className="stack-gap browse-rh-screen browse-rh-detail-screen">
        <section className="browse-rh-detail-hero">
          <div className="browse-rh-detail-head">
            <div>
              <p className="browse-rh-detail-kicker">{selectedAsset.market}</p>
              <h1 className="browse-rh-detail-symbol">{displaySymbol(selectedAsset.symbol, selectedAsset.market)}</h1>
              <p className="browse-rh-detail-name">{detailOverview?.name || selectedAsset.name}</p>
            </div>
            <button type="button" className={`browse-rh-watch-btn ${watched ? 'active' : ''}`} onClick={toggleWatch}>
              {watched ? copy.removeWatch : copy.addWatch}
            </button>
          </div>

          <div className="browse-rh-pill-row">
            {DETAIL_RANGES.map((range) => (
              <button key={range} type="button" className={`browse-rh-pill ${detailRange === range ? 'active' : ''}`} onClick={() => setDetailRange(range)}>
                {range}
              </button>
            ))}
          </div>

          <div className="browse-rh-detail-chart-shell">
            {detailState.loading ? <div className="browse-rh-empty">{copy.loading}</div> : null}
            {!detailState.loading && detailState.error ? <div className="browse-rh-empty">{detailState.error}</div> : null}
            {!detailState.loading && detailState.values.length ? (
              <>
                <div className="browse-rh-detail-quote">
                  <div>
                    <p className="browse-rh-detail-price">{compactPrice(detailState.latest, locale)}</p>
                    <p className={`browse-rh-detail-change ${toneClass(detailState.change)}`}>{percentText(detailState.change, locale)}</p>
                  </div>
                  <div className="browse-rh-detail-meta">
                    <span>{copy.source}: {detailState.source || '--'}</span>
                    <span>{copy.updated}: {formatAsOf(detailState.asOf, locale)}</span>
                  </div>
                </div>
                <MiniChart values={detailState.values} tone={toneClass(detailState.change)} width={320} height={146} className="browse-rh-detail-chart" />
              </>
            ) : null}
          </div>
        </section>

        <section className="browse-rh-section">
          <div className="browse-rh-detail-grid">
            <DetailStat label={copy.latest} value={compactPrice(detailState.latest, locale)} />
            <DetailStat label={copy.change} value={percentText(detailState.change, locale)} />
            <DetailStat
              label={copy.range}
              value={
                Number.isFinite(detailState.low) && Number.isFinite(detailState.high)
                  ? `${compactPrice(detailState.low, locale)} - ${compactPrice(detailState.high, locale)}`
                  : '--'
              }
            />
            <DetailStat label={copy.points} value={String(detailState.values.length || '--')} />
            <DetailStat label={copy.venue} value={detailOverview?.profile?.tradingVenue || '--'} />
            <DetailStat label={copy.currency} value={detailOverview?.profile?.quoteCurrency || '--'} />
          </div>
        </section>

        {detailOverview ? (
          <>
            <section className="browse-rh-section">
              <SectionHeader title={copy.fundamentals} />
              <div className="browse-rh-detail-grid">
                {(detailOverview.fundamentals || []).map((item) => (
                  <DetailStat key={`${item.label}-${item.value}`} label={item.label} value={item.value || '--'} note={item.source} />
                ))}
              </div>
            </section>

            <section className="browse-rh-section">
              <SectionHeader title={copy.relatedEtfs} />
              <div className="browse-rh-chip-grid">
                {(detailOverview.relatedEtfs || []).map((item) => (
                  <MoverChip key={`etf-${item}`} item={{ symbol: item, market: 'US', change: null }} locale={locale} onOpen={openItem} />
                ))}
              </div>
            </section>

            <section className="browse-rh-section">
              <SectionHeader title={copy.derivatives} />
              <div className="browse-rh-detail-grid">
                {(detailOverview.optionEntries || []).map((item) => (
                  <DetailStat key={`${item.label}-${item.description}`} label={item.label} value={item.description} />
                ))}
              </div>
            </section>
          </>
        ) : null}

        <section className="browse-rh-section">
          <SectionHeader title={copy.topNews} />
          {detailNews.length ? (
            <div className="browse-rh-list">
              {detailNews.map((item) => (
                <NewsRow key={item.id || `${item.symbol}-${item.headline}`} item={item} locale={locale} onOpen={openItem} />
              ))}
            </div>
          ) : (
            <div className="browse-rh-empty">No news</div>
          )}
        </section>
      </section>
    );
  }

  if (selectedAsset) return renderDetail();
  if (activeList) return renderList();
  return renderHome();
}

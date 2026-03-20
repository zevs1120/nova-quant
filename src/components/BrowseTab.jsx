import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';
import { fetchApiJson } from '../utils/api';

function asNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function barsForInstrument(instrument, count = 24) {
  const bars = Array.isArray(instrument?.bars) ? instrument.bars : [];
  return bars
    .slice(-count)
    .map((bar) => ({
      close: asNumber(bar?.close),
      date: String(bar?.date || bar?.ts_open || '')
    }))
    .filter((point) => point.date && Number.isFinite(point.close));
}

function linePath(values, width = 176, height = 62) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function pctChangeFromBars(instrument) {
  const bars = barsForInstrument(instrument, 8);
  if (bars.length < 2) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  if (!first) return null;
  return (last - first) / first;
}

function toneForChange(change) {
  if (!Number.isFinite(change)) return 'neutral';
  return change >= 0 ? 'positive' : 'negative';
}

function prettyPrice(value, locale) {
  if (!Number.isFinite(value)) return '--';
  return formatNumber(value, 2, locale);
}

function pctText(value, locale) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value * 100, 2, locale)}%`;
}

function latestClose(instrument) {
  const bars = barsForInstrument(instrument, 2);
  return bars[bars.length - 1]?.close ?? null;
}

function formatAsOfLabel(value, locale) {
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

function average(values = []) {
  const safe = values.filter((value) => Number.isFinite(value));
  if (!safe.length) return null;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

function compactPrice(value, locale) {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) return formatNumber(value, 0, locale);
  if (Math.abs(value) >= 100) return formatNumber(value, 2, locale);
  return formatNumber(value, 3, locale);
}

function normalizeTextToken(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function matchesAnyToken(text, tokens = []) {
  const haystack = normalizeTextToken(text);
  return tokens.some((token) => haystack.includes(normalizeTextToken(token)));
}

function minutesAgoLabel(minutes, locale) {
  const isZh = locale?.startsWith('zh');
  if (!Number.isFinite(minutes) || minutes <= 1) return isZh ? '刚刚' : 'Just now';
  if (minutes < 60) return isZh ? `${Math.round(minutes)} 分钟前` : `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  return isZh ? `${formatNumber(hours, 1, locale)} 小时前` : `${formatNumber(hours, 1, locale)}h ago`;
}

function minutesAgoFromIso(value) {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (Date.now() - ts) / 60000);
}

function toFeedRowFromNews(item, locale) {
  const minutesAgo = minutesAgoFromIso(item?.publishedAt);
  return {
    symbol: String(item?.symbol || '').toUpperCase(),
    badge:
      String(item?.sentiment || '').toUpperCase() === 'POSITIVE'
        ? locale?.startsWith('zh')
          ? '利好'
          : 'Bullish'
        : String(item?.sentiment || '').toUpperCase() === 'NEGATIVE'
          ? locale?.startsWith('zh')
            ? '利空'
            : 'Bearish'
          : locale?.startsWith('zh')
            ? '新闻'
            : 'News',
    title: item?.headline || '--',
    body: [item?.source, Number.isFinite(Number(item?.relevance)) ? `Rel ${formatNumber(Number(item.relevance) * 100, 0, locale)}%` : null]
      .filter(Boolean)
      .join(' · '),
    minutesAgo,
    url: item?.url || null,
    source: item?.source || null
  };
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="browse-search-glyph" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L16.5 16.5" />
    </svg>
  );
}

function PulseCard({ item, locale, labels, onOpen }) {
  const tone = toneForChange(item.change);
  return (
    <button type="button" className="browse-pulse-card" onClick={() => onOpen?.(item.instrument)}>
      <div className="browse-pulse-head">
        <div>
          <p className="browse-pulse-symbol">{item.label || item.instrument.ticker}</p>
          <p className="browse-pulse-caption">{item.caption || item.instrument.name || item.instrument.ticker}</p>
        </div>
        <span className={`browse-result-tag browse-result-tag-${tone === 'positive' ? 'live' : tone === 'negative' ? 'remote' : 'reference'}`}>
          {item.instrument.assetClass === 'CRYPTO' ? labels.cryptoTag : labels.stockTag}
        </span>
      </div>
      <div className="browse-pulse-chart">
        <BrowseMiniChart values={item.values} tone={tone} width={220} height={72} />
      </div>
      <div className="browse-pulse-footer">
        <p className="browse-pulse-price">{compactPrice(item.latest, locale)}</p>
        <p className={`browse-pulse-change ${tone}`}>{pctText(item.change, locale)}</p>
      </div>
    </button>
  );
}

function QuickAccessChip({ item, locale, onOpen }) {
  const tone = toneForChange(item.change);
  return (
    <button type="button" className="browse-quick-chip" onClick={() => onOpen?.(item.instrument)}>
      <span className="browse-quick-chip-symbol">{item.instrument.ticker}</span>
      <span className="browse-quick-chip-price">{compactPrice(item.latest, locale)}</span>
      <span className={`browse-quick-chip-change ${tone}`}>{pctText(item.change, locale)}</span>
    </button>
  );
}

function CollectionCard({ collection, locale, onOpen }) {
  const tone = toneForChange(collection.avgChange);
  const isZh = locale?.startsWith('zh');
  return (
    <article className="browse-collection-card">
      <div className="browse-collection-head">
        <div>
          <p className="browse-collection-title">{collection.title}</p>
          <p className="browse-collection-subtitle">{collection.subtitle}</p>
        </div>
        <span className={`browse-collection-badge ${tone}`}>{pctText(collection.avgChange, locale)}</span>
      </div>
      <div className="browse-collection-members">
        {collection.members.slice(0, 4).map((member) => (
          <button key={`${collection.key}-${member.ticker}`} type="button" className="browse-collection-chip" onClick={() => onOpen?.(member)}>
            {member.ticker}
          </button>
        ))}
      </div>
      <button type="button" className="browse-collection-open" onClick={() => onOpen?.(collection, { view: 'collection' })}>
        {isZh ? '查看主题' : 'View collection'}
      </button>
      <p className="browse-collection-footnote">
        {isZh ? `${collection.members.length} 个标的` : `${collection.members.length} ${collection.members.length === 1 ? 'asset' : 'assets'}`}
      </p>
    </article>
  );
}

function SignalIdeaCard({ item, locale, labels, onOpen }) {
  return (
    <button type="button" className="browse-signal-card" onClick={() => onOpen?.(item.symbol)}>
      <div className="browse-signal-head">
        <div>
          <p className="browse-signal-symbol">{item.symbol}</p>
          <p className="browse-signal-copy">{item.thesis}</p>
        </div>
        <span className={`browse-result-tag browse-result-tag-${item.market === 'CRYPTO' ? 'reference' : 'live'}`}>{item.direction}</span>
      </div>
      <div className="browse-signal-meta">
        <span>{labels.confidenceShort} {formatNumber(item.confidence, 0, locale)}</span>
        <span>{labels.horizonShort} {item.timeframe}</span>
      </div>
    </button>
  );
}

function DetailChipRow({ items, onOpen }) {
  return (
    <div className="browse-detail-chip-row">
      {items.map((item) => (
        <button key={item.symbol} type="button" className="browse-detail-chip" onClick={() => onOpen?.(item.symbol)}>
          {item.symbol}
        </button>
      ))}
    </div>
  );
}

function StoryCard({ item, onOpen }) {
  return (
    <article className="browse-story-card">
      <div className="browse-story-head">
        <div>
          <p className="browse-story-title">{item.title}</p>
          <p className="browse-story-copy">{item.copy}</p>
        </div>
        <span className="browse-result-tag browse-result-tag-reference">{item.badge}</span>
      </div>
      {item.symbols?.length ? (
        <div className="browse-story-symbols">
          {item.symbols.map((symbol) => (
            <button key={`${item.title}-${symbol}`} type="button" className="browse-collection-chip" onClick={() => onOpen?.(symbol)}>
              {symbol}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FeedRow({ item, locale, onOpen }) {
  const isZh = locale?.startsWith('zh');
  return (
    <article className="browse-feed-row">
      <button type="button" className="browse-feed-main" onClick={() => onOpen?.(item.symbol)}>
        <div className="browse-feed-copy">
          <div className="browse-feed-head">
            <p className="browse-feed-title">{item.title}</p>
            <span className="browse-result-tag browse-result-tag-reference">{item.badge}</span>
          </div>
          <p className="browse-feed-body">{item.body}</p>
        </div>
        <div className="browse-feed-meta">
          <span className="browse-feed-symbol">{item.symbol}</span>
          <span className="browse-feed-time">{minutesAgoLabel(item.minutesAgo, locale)}</span>
        </div>
      </button>
      {item.url ? (
        <a
          className="browse-feed-link"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {item.source || (isZh ? '来源' : 'Source')}
        </a>
      ) : null}
    </article>
  );
}

function OverviewFactCard({ label, value, footnote }) {
  return (
    <article className="browse-detail-card browse-detail-card-compact">
      <p className="browse-detail-label">{label}</p>
      <p className="browse-detail-copy">{value || '--'}</p>
      {footnote ? <p className="browse-detail-note">{footnote}</p> : null}
    </article>
  );
}

function CollectionMemberRow({ item, locale, onOpen }) {
  const tone = toneForChange(item.change);
  return (
    <button type="button" className="browse-member-row" onClick={() => onOpen?.(item.instrument)}>
      <div>
        <p className="browse-member-symbol">{item.instrument.ticker}</p>
        <p className="browse-member-caption">{item.instrument.name || item.instrument.sector || item.instrument.ticker}</p>
      </div>
      <div className="browse-member-quote">
        <span className="browse-member-price">{compactPrice(item.latest, locale)}</span>
        <span className={`browse-member-change ${tone}`}>{pctText(item.change, locale)}</span>
      </div>
    </button>
  );
}

function BrowseMiniChart({ values, tone = 'neutral', width = 176, height = 62, className = '' }) {
  const path = useMemo(() => linePath(values, width, height), [height, values, width]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`browse-mini-chart browse-mini-chart-${tone} ${className}`.trim()}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function FuturesCard({ item, locale, onOpen }) {
  const bars = barsForInstrument(item, 18);
  const values = bars.map((point) => point.close);
  const latest = values[values.length - 1];
  const change = pctChangeFromBars(item);
  const tone = toneForChange(change);
  return (
    <button type="button" className="browse-futures-card" onClick={() => onOpen?.(item)}>
      <div className="browse-futures-copy">
        <p className="browse-futures-title">{item.display || item.ticker}</p>
        <p className="browse-futures-subtitle">{item.contract || item.label}</p>
      </div>
      <BrowseMiniChart values={values} tone={tone} />
      <div className="browse-futures-footer">
        <p className="browse-futures-price">{prettyPrice(latest, locale)}</p>
        <p className={`browse-futures-change ${tone}`}>{pctText(change, locale)}</p>
      </div>
    </button>
  );
}

function MoverChip({ item, locale, onOpen }) {
  const tone = toneForChange(item.change);
  return (
    <button type="button" className={`browse-mover-chip browse-mover-chip-${tone}`} onClick={() => onOpen?.(item.symbol)}>
      <span className="browse-mover-symbol">{item.symbol}</span>
      <span className="browse-mover-change">{pctText(item.change, locale)}</span>
    </button>
  );
}

function EarningsRow({ item, onOpen }) {
  return (
    <button type="button" className="browse-earnings-row" onClick={() => onOpen?.(item.symbol)}>
      <div>
        <p className="browse-earnings-symbol">{item.symbol}</p>
        <p className="browse-earnings-caption">{item.note}</p>
      </div>
      <span className="browse-earnings-time">{item.time}</span>
    </button>
  );
}

function normalizeQuery(value) {
  return String(value || '').trim();
}

function BrowseResultRow({ item, locale, labels, onOpen }) {
  const isZh = locale?.startsWith('zh');
  const marketLabel = item.market === 'CRYPTO' ? (isZh ? '加密' : 'Crypto') : isZh ? '美股' : 'Stock';
  const sourceLabel = item.source === 'live' ? labels.live : item.source === 'remote' ? labels.remote : labels.reference;
  const subtitle = item.name && item.name !== item.symbol ? item.name : item.hint;

  return (
    <button type="button" className="browse-result-row" onClick={() => onOpen?.(item)}>
      <div className="browse-result-copy">
        <div className="browse-result-headline">
          <p className="browse-result-symbol">{item.symbol}</p>
          <div className="browse-result-tags">
            <span className="browse-result-tag">{marketLabel}</span>
            <span className={`browse-result-tag browse-result-tag-${item.source}`}>{sourceLabel}</span>
          </div>
        </div>
        <p className="browse-result-subtitle">{subtitle}</p>
      </div>
      <span className="browse-result-chevron" aria-hidden="true">
        ›
      </span>
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
  const [category, setCategory] = useState('now');
  const [searchValue, setSearchValue] = useState('');
  const [searchState, setSearchState] = useState('idle');
  const [searchResults, setSearchResults] = useState([]);
  const [activeResult, setActiveResult] = useState(null);
  const [activeCollectionKey, setActiveCollectionKey] = useState(null);
  const [collectionSort, setCollectionSort] = useState('move');
  const [detailRange, setDetailRange] = useState('1D');
  const [marketNews, setMarketNews] = useState([]);
  const [detailOverview, setDetailOverview] = useState(null);
  const [detailNews, setDetailNews] = useState([]);
  const [detailState, setDetailState] = useState({
    loading: false,
    values: [],
    latest: null,
    open: null,
    low: null,
    high: null,
    change: null,
    asOf: null,
    source: null,
    sourceStatus: null,
    note: '',
    resolvedSymbol: null
  });
  const isZh = locale?.startsWith('zh');
  const trimmedQuery = normalizeQuery(searchValue);
  const showSearchResults = trimmedQuery.length > 0;
  const showSports = category === 'sports';
  const showCryptoFocus = category === 'crypto';
  const showMacroFocus = category === 'macro';
  const normalizedWatchlist = useMemo(
    () => (watchlist || []).map((item) => String(item || '').trim().toUpperCase()),
    [watchlist]
  );

  const labels = useMemo(
    () => ({
      title: isZh ? '发现' : 'Browse',
      search: isZh ? '搜索股票、公司名或加密货币' : 'Search stocks, companies, or crypto',
      results: isZh ? '搜索结果' : 'Results',
      noResults: isZh ? '暂时没找到，试试 ticker、公司名或币名。' : 'Nothing matched yet. Try a ticker, company name, or crypto name.',
      offline: isZh ? '搜索暂时不可用，请稍后重试。' : 'Search is temporarily unavailable.',
      loading: isZh ? '正在搜索…' : 'Searching…',
      clear: isZh ? '清除' : 'Clear',
      back: isZh ? '发现' : 'Browse',
      live: isZh ? '实时池' : 'Live',
      remote: isZh ? '市场' : 'Market',
      reference: isZh ? '扩展池' : 'Universe',
      addToWatchlist: isZh ? '加入观察列表' : 'Add to Watchlist',
      watched: isZh ? '已在观察列表' : 'In Watchlist',
      openMy: isZh ? '打开我的观察列表' : 'Open My Watchlist',
      unavailable: isZh ? '暂时拿不到这只标的的图表数据。' : 'Chart data is temporarily unavailable for this asset.',
      loadingDetail: isZh ? '正在拉取今天的走势…' : "Loading today's chart…",
      apiOffline:
        isZh ? '搜索服务暂时离线，已尝试本地与远端 API。' : 'Search is offline right now after trying the local and deployed API.',
      whatThisIs: isZh ? '这是什么' : 'What this is',
      whyItShows: isZh ? '为什么会出现' : 'Why it surfaced',
      todayTrend: isZh ? '今日走势' : 'Today',
      openingPrice: isZh ? '开盘' : 'Open',
      sessionRange: isZh ? '日内区间' : 'Day range',
      pointsSeen: isZh ? '分时点数' : 'Points',
      dataSource: isZh ? '数据来源' : 'Data source',
      lastUpdated: isZh ? '最后更新' : 'Last updated',
      liveStatus: isZh ? '实时状态' : 'Status',
      liveNow: isZh ? '实时 / 当日分时' : 'Live intraday',
      cached: isZh ? '缓存 / 最近可用' : 'Latest cached',
      stockTag: isZh ? '股票' : 'Stock',
      cryptoTag: isZh ? '加密' : 'Crypto',
      confidenceShort: isZh ? '置信度' : 'Conf',
      horizonShort: isZh ? '周期' : 'Horizon',
      marketPulse: isZh ? '市场脉搏' : 'Market pulse',
      heroTitle: isZh ? '像券商首页一样浏览今天的市场' : 'Browse the market like a broker home screen',
      heroSubtitle: isZh ? '先看市场脉搏，再进主题、信号和个股详情。' : 'Scan pulse, jump into themes, then drill into assets.',
      quickAccess: isZh ? '快捷入口' : 'Quick access',
      quickAccessEmpty: isZh ? '把标的加入观察列表后，这里会出现你的快捷入口。' : 'Add assets to your watchlist to pin them here.',
      strategyIdeas: isZh ? '信号机会带' : 'Signal opportunities',
      collections: isZh ? '主题板块' : 'Collections',
      relatedAssets: isZh ? '关联标的' : 'Related assets',
      collectionLinks: isZh ? '所在主题' : 'Collections',
      signalContext: isZh ? '策略上下文' : 'Signal context',
      noSignals: isZh ? '当前还没有可展示的信号卡片。' : 'No signal cards to surface right now.',
      regimeNow: isZh ? '当前环境' : 'Current regime',
      breadthNow: isZh ? '市场广度' : 'Breadth',
      pulseFootnote: isZh ? '点击任意卡片进入详情页。' : 'Tap any card to open the asset detail page.',
      marketStories: isZh ? '市场线索' : 'Market stories',
      detailRanges: ['1D', '1W', '1M', '3M'],
      periodLabel: isZh ? '区间' : 'Range',
      chartSource: isZh ? '图表口径' : 'Chart mode',
      liveToday: isZh ? '当日实时' : 'Live today',
      historicalClose: isZh ? '历史收盘' : 'Historical close',
      liveFeed: isZh ? '动态流' : 'Live feed',
      viewCollection: isZh ? '查看主题' : 'View collection',
      collectionPulse: isZh ? '主题概览' : 'Collection pulse',
      collectionMembers: isZh ? '主题成员' : 'Members',
      collectionFlow: isZh ? '主题动态' : 'Collection flow',
      collectionSorts: [
        { key: 'move', label: isZh ? '涨跌幅' : 'Move' },
        { key: 'symbol', label: isZh ? '代码' : 'Symbol' },
        { key: 'price', label: isZh ? '价格' : 'Price' }
      ],
      assetBasics: isZh ? '基本面/概览' : 'Basics',
      topNews: isZh ? '相关新闻' : 'Top news',
      relatedEtfs: isZh ? '相关 ETF' : 'Related ETFs',
      derivatives: isZh ? '期权 / 衍生品入口' : 'Options / derivatives',
      categories: [
        { key: 'now', label: isZh ? '现在' : 'Now' },
        { key: 'macro', label: isZh ? '宏观' : 'Macro' },
        { key: 'crypto', label: isZh ? '加密' : 'Crypto' },
        { key: 'sports', label: isZh ? '体育' : 'Sports' }
      ],
      futures: isZh ? '期货市场' : 'Futures markets',
      movers: isZh ? '涨跌榜' : 'Top movers',
      cryptoMovers: isZh ? '加密异动' : 'Crypto movers',
      earnings: isZh ? '财报日历' : 'Earnings',
      noSports: isZh ? '今天没有特别清晰的体育事件联动。' : 'No sharp sports-linked setups today.'
    }),
    [isZh]
  );

  useEffect(() => {
    if (!showSearchResults) {
      setSearchState('idle');
      setSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    setSearchState('loading');
    const timer = window.setTimeout(async () => {
      try {
        const payload = await fetchApiJson(`/api/assets/search?q=${encodeURIComponent(trimmedQuery)}&limit=24`);
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
  }, [showSearchResults, trimmedQuery]);

  useEffect(() => {
    let cancelled = false;
    const market = showCryptoFocus ? 'CRYPTO' : 'US';
    void fetchApiJson(`/api/browse/news?market=${market}&limit=8`)
      .then((payload) => {
        if (cancelled) return;
        setMarketNews(Array.isArray(payload?.data) ? payload.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setMarketNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showCryptoFocus]);

  useEffect(() => {
    setCollectionSort('move');
  }, [activeCollectionKey]);

  useEffect(() => {
    if (!activeResult) {
      setDetailState({
        loading: false,
        values: [],
        latest: null,
        open: null,
        low: null,
        high: null,
        change: null,
        asOf: null,
        source: null,
        sourceStatus: null,
        note: '',
        resolvedSymbol: null
      });
      setDetailOverview(null);
      setDetailNews([]);
      return undefined;
    }

    let cancelled = false;
    setDetailState((current) => ({
      ...current,
      loading: true,
      values: [],
      latest: null,
      open: null,
      low: null,
      high: null,
      change: null,
      asOf: null,
      source: null,
      sourceStatus: null,
      note: '',
      resolvedSymbol: null
    }));
    const market = encodeURIComponent(activeResult.market);
    const symbol = encodeURIComponent(activeResult.symbol);
    const isLiveDay = detailRange === '1D';
    const historyConfig =
      detailRange === '1W'
        ? { tf: '1d', limit: 7 }
        : detailRange === '1M'
          ? { tf: '1d', limit: 30 }
          : { tf: '1d', limit: 90 };
    const request = isLiveDay
      ? fetchApiJson(`/api/browse/chart?market=${market}&symbol=${symbol}`)
      : fetchApiJson(`/api/ohlcv?market=${market}&symbol=${symbol}&tf=${historyConfig.tf}&limit=${historyConfig.limit}`);

    void request
      .then((payload) => {
        if (cancelled) return;
        const chart = isLiveDay ? payload?.data || {} : null;
        const historyRows = !isLiveDay && Array.isArray(payload?.data) ? payload.data : [];
        const values = isLiveDay
          ? Array.isArray(chart?.points)
            ? chart.points.map((point) => asNumber(point?.close)).filter((value) => Number.isFinite(value))
            : []
          : historyRows.map((row) => asNumber(row?.close)).filter((value) => Number.isFinite(value));
        const open = values[0] ?? null;
        const low = values.length ? Math.min(...values) : null;
        const high = values.length ? Math.max(...values) : null;
        const latest = values[values.length - 1] ?? null;
        const previous = values[0] ?? null;
        const change = latest !== null && previous !== null && previous ? (latest - previous) / previous : null;
        const asOf = isLiveDay
          ? chart?.asOf || null
          : historyRows.length
            ? new Date(Number(historyRows[historyRows.length - 1]?.ts_open || historyRows[historyRows.length - 1]?.ts || Date.now())).toISOString()
            : null;
        setDetailState({
          loading: false,
          values,
          latest: isLiveDay ? asNumber(chart?.latest) : latest,
          open,
          low,
          high,
          change: isLiveDay ? asNumber(chart?.change) : change,
          asOf,
          source: isLiveDay ? chart?.source || null : 'Local OHLCV history',
          sourceStatus: isLiveDay ? chart?.sourceStatus || null : 'CACHED',
          note: isLiveDay ? chart?.note || '' : `Historical ${detailRange} close series`,
          resolvedSymbol: isLiveDay ? chart?.resolvedSymbol || null : activeResult.symbol
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetailState({
          loading: false,
          values: [],
          latest: null,
          open: null,
          low: null,
          high: null,
          change: null,
          asOf: null,
          source: null,
          sourceStatus: null,
          note: '',
          resolvedSymbol: null
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeResult, detailRange]);

  useEffect(() => {
    if (!activeResult) return undefined;
    let cancelled = false;
    setDetailOverview(null);
    setDetailNews([]);
    const market = encodeURIComponent(activeResult.market);
    const symbol = encodeURIComponent(activeResult.symbol);
    Promise.all([
      fetchApiJson(`/api/browse/overview?market=${market}&symbol=${symbol}`),
      fetchApiJson(`/api/browse/news?market=${market}&symbol=${symbol}&limit=6`)
    ])
      .then(([overviewPayload, newsPayload]) => {
        if (cancelled) return;
        setDetailOverview(overviewPayload?.data || null);
        setDetailNews(Array.isArray(newsPayload?.data) ? newsPayload.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailOverview(null);
        setDetailNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeResult]);

  const instruments = useMemo(
    () =>
      (marketInstruments || []).map((item) => ({
        ...item,
        ticker: String(item?.ticker || '').toUpperCase(),
        assetClass: String(item?.asset_class || item?.assetClass || '').toUpperCase()
      })),
    [marketInstruments]
  );

  const buildBrowseDetailItem = useCallback(
    (instrument) => {
      if (!instrument?.ticker) return null;
      const market = instrument.assetClass === 'CRYPTO' ? 'CRYPTO' : 'US';
      const venue = instrument.venue || instrument.exchange || (market === 'CRYPTO' ? 'Spot' : 'US Market');
      const displayName =
        instrument.name ||
        instrument.display_name ||
        instrument.display ||
        instrument.company ||
        instrument.label ||
        (market === 'CRYPTO' ? `${instrument.base || instrument.ticker} / ${instrument.quote || 'USDT'}` : instrument.ticker);
      const latest = latestClose(instrument);
      const move = pctChangeFromBars(instrument);
      const latestText = Number.isFinite(latest) ? prettyPrice(latest, locale) : '--';
      const moveText = Number.isFinite(move) ? pctText(move, locale) : '--';

      return {
        market,
        symbol: instrument.ticker,
        name: displayName,
        hint:
          market === 'CRYPTO'
            ? `${isZh ? '今日变动' : 'Today'} ${moveText} · ${latestText}`
            : `${venue} · ${isZh ? '最新价' : 'Last'} ${latestText} · ${moveText}`,
        source: 'live',
        venue
      };
    },
    [isZh, locale]
  );

  const nonCrypto = useMemo(
    () => instruments.filter((item) => item.ticker && item.assetClass !== 'CRYPTO'),
    [instruments]
  );
  const crypto = useMemo(
    () => instruments.filter((item) => item.ticker && item.assetClass === 'CRYPTO'),
    [instruments]
  );

  const browseDetailMap = useMemo(
    () =>
      new Map(
        instruments
          .map((item) => [item.ticker, buildBrowseDetailItem(item)])
          .filter((entry) => entry[0] && entry[1])
      ),
    [buildBrowseDetailItem, instruments]
  );

  const openInstrumentResult = useCallback(
    (instrument) => {
      const next = buildBrowseDetailItem(instrument);
      if (next) {
        setDetailRange('1D');
        setActiveResult(next);
      }
    },
    [buildBrowseDetailItem]
  );

  const openSymbolResult = useCallback(
    (symbol, marketHint) => {
      const normalizedSymbol = String(symbol || '').trim().toUpperCase();
      if (!normalizedSymbol) return;
      const next = browseDetailMap.get(normalizedSymbol);
      if (next) {
        setDetailRange('1D');
        setActiveResult(next);
        return;
      }

      void fetchApiJson(`/api/assets/search?q=${encodeURIComponent(normalizedSymbol)}&limit=12`)
        .then((payload) => {
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          const exact =
            rows.find((item) => item?.symbol === normalizedSymbol && (!marketHint || item?.market === marketHint)) ||
            rows.find((item) => item?.symbol === normalizedSymbol) ||
            rows[0];
          if (exact) {
            setDetailRange('1D');
            setActiveResult(exact);
            return;
          }
          setDetailRange('1D');
          setActiveResult({
            market: marketHint || 'US',
            symbol: normalizedSymbol,
            name: normalizedSymbol,
            hint: normalizedSymbol,
            source: 'reference',
            venue: marketHint === 'CRYPTO' ? 'Spot' : 'US Market'
          });
        })
        .catch(() => {
          setDetailRange('1D');
          setActiveResult({
            market: marketHint || 'US',
            symbol: normalizedSymbol,
            name: normalizedSymbol,
            hint: normalizedSymbol,
            source: 'reference',
            venue: marketHint === 'CRYPTO' ? 'Spot' : 'US Market'
          });
        });
    },
    [browseDetailMap]
  );

  const openSearchResult = useCallback((item) => {
    setDetailRange('1D');
    setActiveResult(item);
  }, []);

  const openCollectionPage = useCallback((collectionOrKey) => {
    const nextKey = typeof collectionOrKey === 'string' ? collectionOrKey : collectionOrKey?.key;
    if (!nextKey) return;
    setActiveCollectionKey(nextKey);
  }, []);

  const futuresMarkets = useMemo(() => {
    const preferred = ['SPY', 'QQQ', 'IWM', 'BTC', 'ETH'];
    const selected = [];
    preferred.forEach((symbol) => {
      const match = instruments.find((item) => item.ticker === symbol);
      if (match) {
        selected.push({
          ...match,
          display:
            symbol === 'SPY'
              ? isZh
                ? '标普 500'
                : 'S&P 500'
              : symbol === 'QQQ'
                ? isZh
                  ? '纳指 100'
                  : 'Nasdaq 100'
                : match.ticker,
          contract: symbol === 'SPY' ? '/MES' : symbol === 'QQQ' ? '/MNQ' : `/${match.ticker}`
        });
      }
    });
    return selected.length
      ? selected.slice(0, 3)
      : nonCrypto.slice(0, 3).map((item) => ({ ...item, display: item.ticker, contract: `/${item.ticker}` }));
  }, [instruments, isZh, nonCrypto]);

  const topMovers = useMemo(() => {
    return nonCrypto
      .map((item) => ({ symbol: item.ticker, change: pctChangeFromBars(item) }))
      .filter((item) => Number.isFinite(item.change))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 6);
  }, [nonCrypto]);

  const cryptoMovers = useMemo(() => {
    return crypto
      .map((item) => ({ symbol: item.ticker, change: pctChangeFromBars(item) }))
      .filter((item) => Number.isFinite(item.change))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 6);
  }, [crypto]);

  const earningsRows = useMemo(() => {
    const cards = (signals || []).slice(0, 4);
    if (!cards.length) {
      return [
        {
          symbol: 'NVDA',
          note: isZh ? '收盘后关注仓位节奏。' : 'Watch sizing after the close.',
          time: isZh ? '盘后' : 'After close'
        },
        {
          symbol: 'AAPL',
          note: isZh ? '事件前避免追高。' : 'Do not chase ahead of the event.',
          time: isZh ? '明早' : 'Tomorrow'
        }
      ];
    }
    return cards.map((signal, index) => ({
      symbol: signal.symbol || signal.ticker || `EQ${index + 1}`,
      note: isZh ? '结果前先控仓，别追。' : 'Keep size tight into the result.',
      time: index % 2 === 0 ? (isZh ? '盘后' : 'After close') : isZh ? '盘前' : 'Before open'
    }));
  }, [signals, isZh]);

  const sportsRows = useMemo(() => {
    const preferred = ['DKNG', 'DIS', 'TKO', 'SONY'];
    const rows = preferred
      .map((symbol) => instruments.find((item) => item.ticker === symbol))
      .filter(Boolean)
      .map((item) => ({
        symbol: item.ticker,
        change: pctChangeFromBars(item)
      }));
    return rows.slice(0, 4);
  }, [instruments]);

  const signalIdeas = useMemo(() => {
    return (signals || [])
      .map((signal) => ({
        symbol: String(signal?.symbol || signal?.ticker || '').toUpperCase(),
        direction: String(signal?.direction || 'WATCH').toUpperCase(),
        confidence: Number(signal?.confidence_level || (Number(signal?.confidence) <= 1 ? Number(signal?.confidence) * 100 : signal?.confidence || 0)),
        timeframe: String(signal?.timeframe || signal?.holding_horizon_days || '--'),
        thesis:
          signal?.thesis ||
          signal?.headline ||
          signal?.explain_bullets?.[0] ||
          signal?.rationale?.[0] ||
          (isZh ? '等待更清晰的结构确认。' : 'Waiting for a cleaner structure confirmation.'),
        market: String(signal?.market || '').toUpperCase() || 'US'
      }))
      .filter((item) => item.symbol)
      .slice(0, 6);
  }, [isZh, signals]);

  const quickAccessCards = useMemo(() => {
    const preferredSymbols = normalizedWatchlist.length
      ? normalizedWatchlist
      : signalIdeas.map((item) => item.symbol).filter(Boolean);
    return preferredSymbols
      .map((symbol) => instruments.find((item) => item.ticker === symbol))
      .filter(Boolean)
      .slice(0, 8)
      .map((instrument) => ({
        instrument,
        latest: latestClose(instrument),
        change: pctChangeFromBars(instrument)
      }));
  }, [instruments, normalizedWatchlist, signalIdeas]);

  const marketPulseCards = useMemo(() => {
    const preferred = showCryptoFocus
      ? ['BTC', 'ETH', 'SOL', 'XRP']
      : showMacroFocus
        ? ['SPY', 'QQQ', 'IWM', 'TLT', 'GLD']
        : ['SPY', 'QQQ', 'AAPL', 'NVDA', 'BTC', 'ETH'];
    return preferred
      .map((symbol) => instruments.find((item) => item.ticker === symbol))
      .filter(Boolean)
      .slice(0, 5)
      .map((instrument) => ({
        instrument,
        values: barsForInstrument(instrument, 20).map((point) => point.close),
        latest: latestClose(instrument),
        change: pctChangeFromBars(instrument),
        label:
          instrument.ticker === 'SPY'
            ? isZh
              ? '标普 500'
              : 'S&P 500'
            : instrument.ticker === 'QQQ'
              ? isZh
                ? '纳指 100'
                : 'Nasdaq 100'
              : instrument.ticker,
        caption: instrument.sector || instrument.assetClass || instrument.market || ''
      }));
  }, [instruments, isZh, showCryptoFocus, showMacroFocus]);

  const themeCollections = useMemo(() => {
    const definitions = showCryptoFocus
      ? [
          { key: 'crypto-majors', title: isZh ? '主流加密' : 'Crypto majors', subtitle: isZh ? '高流动性核心币' : 'High-liquidity core crypto', tokens: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'] },
          { key: 'layer1', title: isZh ? 'L1 链' : 'Layer 1', subtitle: isZh ? '基础公链篮子' : 'Base chain basket', tokens: ['SOL', 'ETH', 'AVAX', 'ATOM', 'APT'] },
          { key: 'exchange-beta', title: isZh ? '风险偏好' : 'Risk beta', subtitle: isZh ? '高波动交易偏好' : 'Higher beta names', tokens: ['DOGE', 'PEPE', 'ARB', 'OP', 'WIF'] }
        ]
      : [
          { key: 'ai-leaders', title: isZh ? 'AI 龙头' : 'AI leaders', subtitle: isZh ? '算力与软件主线' : 'Compute and software leaders', tokens: ['NVDA', 'MSFT', 'META', 'AMD', 'AVGO'] },
          { key: 'semis', title: isZh ? '半导体' : 'Semiconductors', subtitle: isZh ? '芯片设计与设备' : 'Chip design and equipment', tokens: ['NVDA', 'AMD', 'AVGO', 'TSM', 'MU', 'QCOM'] },
          { key: 'mega-cap', title: isZh ? '超级权重' : 'Mega caps', subtitle: isZh ? '指数权重核心资产' : 'Index-weight heavy hitters', tokens: ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA'] },
          { key: 'consumer', title: isZh ? '消费与平台' : 'Consumer & platform', subtitle: isZh ? '流量、零售与娱乐平台' : 'Traffic, retail, and platforms', tokens: ['AMZN', 'NFLX', 'DIS', 'UBER', 'SONY'] }
        ];

    return definitions
      .map((definition) => {
        const members = instruments.filter(
          (item) =>
            definition.tokens.includes(item.ticker) ||
            matchesAnyToken(item.sector, definition.tokens) ||
            matchesAnyToken(item.name, definition.tokens)
        );
        if (!members.length) return null;
        return {
          ...definition,
          members: members.slice(0, 6),
          avgChange: average(members.map((item) => pctChangeFromBars(item)))
        };
      })
      .filter(Boolean)
      .slice(0, 4);
  }, [instruments, isZh, showCryptoFocus]);

  const collectionMap = useMemo(
    () => new Map(themeCollections.map((collection) => [collection.key, collection])),
    [themeCollections]
  );

  const activeCollection = activeCollectionKey ? collectionMap.get(activeCollectionKey) || null : null;
  const activeCollectionMembers = useMemo(() => {
    if (!activeCollection) return [];
    return activeCollection.members.map((instrument) => ({
      instrument,
      latest: latestClose(instrument),
      change: pctChangeFromBars(instrument)
    }));
  }, [activeCollection]);
  const sortedCollectionMembers = useMemo(() => {
    const rows = [...activeCollectionMembers];
    if (collectionSort === 'symbol') {
      return rows.sort((a, b) => a.instrument.ticker.localeCompare(b.instrument.ticker));
    }
    if (collectionSort === 'price') {
      return rows.sort((a, b) => (b.latest || 0) - (a.latest || 0));
    }
    return rows.sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0));
  }, [activeCollectionMembers, collectionSort]);
  const activeCollectionStats = useMemo(() => {
    const sortedByMove = [...activeCollectionMembers].sort((a, b) => (b.change || 0) - (a.change || 0));
    const advancers = activeCollectionMembers.filter((item) => Number(item.change || 0) > 0).length;
    const decliners = activeCollectionMembers.filter((item) => Number(item.change || 0) < 0).length;
    return {
      advancers,
      decliners,
      avgChange: average(activeCollectionMembers.map((item) => item.change)),
      avgPrice: average(activeCollectionMembers.map((item) => item.latest)),
      breadthPct: activeCollectionMembers.length ? advancers / activeCollectionMembers.length : null,
      strongest: sortedByMove[0]?.instrument?.ticker || null,
      weakest: sortedByMove[sortedByMove.length - 1]?.instrument?.ticker || null
    };
  }, [activeCollectionMembers]);

  const activeInstrument = useMemo(
    () => instruments.find((item) => item.ticker === String(activeResult?.symbol || '').toUpperCase()) || null,
    [activeResult?.symbol, instruments]
  );

  const relatedAssets = useMemo(() => {
    if (!activeInstrument) return [];
    const sectorMatches = instruments.filter(
      (item) =>
        item.ticker !== activeInstrument.ticker &&
        ((activeInstrument.sector && item.sector && normalizeTextToken(activeInstrument.sector) === normalizeTextToken(item.sector)) ||
          (activeInstrument.assetClass === item.assetClass && activeInstrument.market === item.market))
    );
    return sectorMatches.slice(0, 6).map((item) => ({ symbol: item.ticker }));
  }, [activeInstrument, instruments]);

  const activeCollections = useMemo(() => {
    if (!activeResult) return [];
    return themeCollections
      .filter((collection) => collection.members.some((item) => item.ticker === activeResult.symbol))
      .map((collection) => ({ key: collection.key, symbol: collection.title }));
  }, [activeResult, themeCollections]);

  const matchingSignals = useMemo(() => {
    if (!activeResult) return [];
    return signalIdeas.filter((item) => item.symbol === activeResult.symbol).slice(0, 2);
  }, [activeResult, signalIdeas]);

  const regimeTag = String(insights?.regime?.tag || insights?.regime || (isZh ? '等待更多市场确认' : 'Waiting for better market confirmation'));
  const breadthRatio = Number(insights?.breadth?.ratio);
  const storyCards = useMemo(() => {
    const cards = [
      {
        title: labels.regimeNow,
        badge: isZh ? '环境' : 'Regime',
        copy: Number.isFinite(breadthRatio)
          ? `${regimeTag} · ${labels.breadthNow} ${formatNumber(breadthRatio * 100, 0, locale)}%`
          : regimeTag,
        symbols: marketPulseCards.slice(0, 3).map((item) => item.instrument.ticker)
      },
      {
        title: labels.strategyIdeas,
        badge: isZh ? '机会' : 'Setup',
        copy: signalIdeas[0]?.thesis || labels.noSignals,
        symbols: signalIdeas.slice(0, 3).map((item) => item.symbol)
      },
      {
        title: labels.earnings,
        badge: isZh ? '事件' : 'Event',
        copy: earningsRows[0]?.note || (isZh ? '今天没有特别集中的事件。' : 'No single event cluster is dominating today.'),
        symbols: earningsRows.slice(0, 3).map((item) => item.symbol)
      }
    ];
    return cards.filter((item) => item.copy);
  }, [breadthRatio, earningsRows, isZh, labels.breadthNow, labels.earnings, labels.noSignals, labels.regimeNow, labels.strategyIdeas, locale, marketPulseCards, regimeTag, signalIdeas]);
  const liveFeedItems = useMemo(() => {
    const feed = [];

    signalIdeas.slice(0, 3).forEach((item, index) => {
      feed.push({
        symbol: item.symbol,
        badge: isZh ? '策略' : 'Setup',
        title: `${item.symbol} ${item.direction}`,
        body: item.thesis,
        minutesAgo: 6 + index * 11
      });
    });

    topMovers.slice(0, 2).forEach((item, index) => {
      feed.push({
        symbol: item.symbol,
        badge: isZh ? '异动' : 'Mover',
        title: `${item.symbol} ${pctText(item.change, locale)}`,
        body: isZh ? '盘中波动扩大，适合放进关注列表。' : 'Intraday range expanded enough to deserve a closer look.',
        minutesAgo: 14 + index * 9
      });
    });

    earningsRows.slice(0, 2).forEach((item, index) => {
      feed.push({
        symbol: item.symbol,
        badge: isZh ? '事件' : 'Event',
        title: `${item.symbol} ${item.time}`,
        body: item.note,
        minutesAgo: 28 + index * 17
      });
    });

    return feed.slice(0, 6);
  }, [earningsRows, isZh, locale, signalIdeas, topMovers]);
  const liveFeedRows = useMemo(() => {
    if (marketNews.length) {
      return marketNews.map((item) => toFeedRowFromNews(item, locale));
    }
    return liveFeedItems;
  }, [liveFeedItems, locale, marketNews]);
  const collectionFeedItems = useMemo(() => {
    if (!activeCollection) return [];
    const symbols = new Set(activeCollection.members.map((item) => item.ticker));
    const newsMatches = marketNews
      .filter((item) => symbols.has(String(item?.symbol || '').toUpperCase()))
      .map((item) => toFeedRowFromNews(item, locale))
      .slice(0, 6);
    if (newsMatches.length) return newsMatches;
    return liveFeedItems.filter((item) => symbols.has(item.symbol)).slice(0, 5);
  }, [activeCollection, liveFeedItems, locale, marketNews]);

  const overviewFactCards = useMemo(() => {
    if (!detailOverview) return [];
    return [
      {
        label: isZh ? '最新收盘' : 'Last close',
        value: compactPrice(detailOverview.tradingStats?.latestClose, locale),
        footnote:
          Number.isFinite(detailOverview.tradingStats?.changePct)
            ? `${isZh ? '日变动' : 'Daily change'} ${pctText(detailOverview.tradingStats.changePct, locale)}`
            : null
      },
      {
        label: isZh ? '均量 30D' : '30D avg volume',
        value: detailOverview.fundamentals?.find((item) => item.label === '30D avg volume')?.value || '--',
        footnote:
          detailOverview.fundamentals?.find((item) => item.label === 'Latest volume')?.value
            ? `${isZh ? '最新成交量' : 'Latest volume'} ${detailOverview.fundamentals.find((item) => item.label === 'Latest volume')?.value}`
            : null
      },
      {
        label: isZh ? '回看区间' : 'Lookback range',
        value:
          Number.isFinite(detailOverview.tradingStats?.rangeLow) && Number.isFinite(detailOverview.tradingStats?.rangeHigh)
            ? `${compactPrice(detailOverview.tradingStats.rangeLow, locale)} - ${compactPrice(detailOverview.tradingStats.rangeHigh, locale)}`
            : '--',
        footnote:
          Number.isFinite(detailOverview.tradingStats?.barsAvailable)
            ? `${detailOverview.tradingStats.barsAvailable} ${isZh ? '根日线' : 'daily bars'}`
            : null
      },
      {
        label: isZh ? '资产类型' : 'Asset type',
        value: detailOverview.assetType,
        footnote: detailOverview.profile?.proxyType || null
      },
      {
        label: isZh ? '交易场所' : 'Trading venue',
        value: detailOverview.profile?.tradingVenue || '--',
        footnote: detailOverview.profile?.tradingSchedule || null
      },
      {
        label: isZh ? '计价货币' : 'Quote currency',
        value: detailOverview.profile?.quoteCurrency || '--',
        footnote: detailOverview.currency || null
      },
      {
        label: isZh ? '新闻语境' : 'News tone',
        value:
          detailOverview.newsContext?.tone === 'POSITIVE'
            ? isZh
              ? '偏利好'
              : 'Positive'
            : detailOverview.newsContext?.tone === 'NEGATIVE'
              ? isZh
                ? '偏利空'
                : 'Negative'
              : detailOverview.newsContext?.tone === 'MIXED'
                ? isZh
                  ? '分化'
                  : 'Mixed'
                : isZh
                  ? '中性'
                  : 'Neutral',
        footnote:
          detailOverview.newsContext?.headline_count > 0
            ? isZh
              ? `${detailOverview.newsContext.headline_count} 条相关标题`
              : `${detailOverview.newsContext.headline_count} related headlines`
            : null
      },
      ...((detailOverview.fundamentals || []).map((item) => ({
        label: item.label,
        value: item.value,
        footnote:
          item.source === 'derived'
            ? isZh
              ? '系统派生'
              : 'Derived'
            : item.source === 'live'
              ? isZh
                ? '实时'
                : 'Live'
              : isZh
                ? '参考'
                : 'Reference'
      })) || [])
    ];
  }, [detailOverview, isZh]);

  const detailNewsRows = useMemo(() => {
    const rows = detailNews.length ? detailNews : detailOverview?.topNews || [];
    return rows.map((item) => toFeedRowFromNews(item, locale));
  }, [detailNews, detailOverview?.topNews, locale]);

  const watchSymbol = String(detailState.resolvedSymbol || activeResult?.symbol || '').toUpperCase();
  const isWatched = Boolean(activeResult && watchSymbol && normalizedWatchlist.includes(watchSymbol));
  const detailTone = toneForChange(detailState.change);
  const detailSourceStatusLabel = detailState.sourceStatus === 'LIVE' ? labels.liveNow : labels.cached;
  const detailSourceText = detailState.source || '--';
  const detailAsOfText = formatAsOfLabel(detailState.asOf, locale);
  const detailRangeText =
    Number.isFinite(detailState.low) && Number.isFinite(detailState.high)
      ? `${prettyPrice(detailState.low, locale)} - ${prettyPrice(detailState.high, locale)}`
      : '--';

  if (activeCollection && !activeResult) {
    return (
      <section className="stack-gap browse-screen browse-detail-screen">
        <div className="detail-nav-bar">
          <button type="button" className="ios-nav-back detail-nav-back" onClick={() => setActiveCollectionKey(null)} aria-label={labels.back}>
            <span className="ios-back-chevron" aria-hidden="true">
              ‹
            </span>
            <span className="ios-back-label">{labels.back}</span>
          </button>
          <p className="detail-nav-title">{activeCollection.title}</p>
          <span className="detail-nav-spacer" aria-hidden="true" />
        </div>

        <section className="browse-collection-hero">
          <div className="browse-collection-head">
            <div>
              <p className="browse-asset-kicker">{labels.collections}</p>
              <h1 className="browse-collection-hero-title">{activeCollection.title}</h1>
              <p className="browse-collection-hero-subtitle">{activeCollection.subtitle}</p>
            </div>
            <span className={`browse-collection-badge ${toneForChange(activeCollection.avgChange)}`}>{pctText(activeCollection.avgChange, locale)}</span>
          </div>
          <div className="browse-hero-metrics">
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">{labels.collectionPulse}</span>
              <strong>{pctText(activeCollection.avgChange, locale)}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">{labels.collectionMembers}</span>
              <strong>{activeCollection.members.length}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">Up / Down</span>
              <strong>{activeCollectionStats.advancers} / {activeCollectionStats.decliners}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">Avg move</span>
              <strong>{pctText(activeCollectionStats.avgChange, locale)}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">{isZh ? '上涨占比' : 'Breadth'}</span>
              <strong>{pctText(activeCollectionStats.breadthPct, locale)}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">{isZh ? '强势成员' : 'Leader'}</span>
              <strong>{activeCollectionStats.strongest || '--'}</strong>
            </div>
            <div className="browse-hero-metric">
              <span className="browse-hero-metric-label">{isZh ? '弱势成员' : 'Laggard'}</span>
              <strong>{activeCollectionStats.weakest || '--'}</strong>
            </div>
          </div>
        </section>

        <section className="browse-detail-grid">
          <OverviewFactCard
            label={isZh ? '平均价格' : 'Average price'}
            value={compactPrice(activeCollectionStats.avgPrice, locale)}
            footnote={isZh ? '主题成员当前均价' : 'Current mean price across members'}
          />
          <OverviewFactCard
            label={isZh ? '上涨家数' : 'Advancers'}
            value={String(activeCollectionStats.advancers || 0)}
            footnote={isZh ? '当日表现为正的成员数' : 'Members trading green on the day'}
          />
          <OverviewFactCard
            label={isZh ? '下跌家数' : 'Decliners'}
            value={String(activeCollectionStats.decliners || 0)}
            footnote={isZh ? '当日表现为负的成员数' : 'Members trading red on the day'}
          />
          <OverviewFactCard
            label={isZh ? '排序模式' : 'Sort mode'}
            value={labels.collectionSorts.find((item) => item.key === collectionSort)?.label || '--'}
            footnote={isZh ? '支持按涨跌幅、代码、价格排序' : 'Sort by move, symbol, or price'}
          />
        </section>

        <section className="browse-section">
          <div className="browse-section-head">
            <h2>{labels.collectionMembers}</h2>
          </div>
          <div className="browse-detail-range-row" role="tablist" aria-label={labels.collectionMembers}>
            {labels.collectionSorts.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={collectionSort === item.key}
                className={`browse-detail-range-pill ${collectionSort === item.key ? 'active' : ''}`}
                onClick={() => setCollectionSort(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="browse-member-list">
            {sortedCollectionMembers.map((item) => (
              <CollectionMemberRow key={`member-${activeCollection.key}-${item.instrument.ticker}`} item={item} locale={locale} onOpen={openInstrumentResult} />
            ))}
          </div>
        </section>

        {collectionFeedItems.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.collectionFlow}</h2>
            </div>
            <div className="browse-feed-list">
              {collectionFeedItems.map((item) => (
                <FeedRow key={`collection-feed-${activeCollection.key}-${item.symbol}-${item.title}`} item={item} locale={locale} onOpen={openSymbolResult} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  if (activeResult) {
    return (
      <section className="stack-gap browse-screen browse-detail-screen">
        <div className="detail-nav-bar">
          <button type="button" className="ios-nav-back detail-nav-back" onClick={() => setActiveResult(null)} aria-label={labels.back}>
            <span className="ios-back-chevron" aria-hidden="true">
              ‹
            </span>
            <span className="ios-back-label">{labels.back}</span>
          </button>
          <p className="detail-nav-title">{activeResult.symbol}</p>
          <span className="detail-nav-spacer" aria-hidden="true" />
        </div>

        <section className="browse-asset-hero">
          <div className="browse-asset-headline">
            <div>
              <p className="browse-asset-kicker">{activeResult.market === 'CRYPTO' ? (isZh ? '加密货币' : 'Crypto') : isZh ? '股票' : 'Stock'}</p>
              <h1 className="browse-asset-symbol">{activeResult.symbol}</h1>
              <p className="browse-asset-name">{activeResult.name || activeResult.hint}</p>
            </div>
            <div className="browse-asset-tags">
              <span className={`browse-result-tag browse-result-tag-${activeResult.source}`}>{activeResult.source === 'live' ? labels.live : activeResult.source === 'remote' ? labels.remote : labels.reference}</span>
            </div>
          </div>

          {detailState.values.length >= 2 ? (
            <div className="browse-asset-chart">
              <div className="browse-detail-range-row" role="tablist" aria-label={labels.periodLabel}>
                {labels.detailRanges.map((range) => (
                  <button
                    key={range}
                    type="button"
                    role="tab"
                    aria-selected={detailRange === range}
                    className={`browse-detail-range-pill ${detailRange === range ? 'active' : ''}`}
                    onClick={() => setDetailRange(range)}
                  >
                    {range}
                  </button>
                ))}
              </div>
              <BrowseMiniChart values={detailState.values} tone={detailTone} width={320} height={148} className="browse-asset-chart-line" />
            </div>
          ) : (
            <div className="browse-asset-empty">{detailState.loading ? labels.loadingDetail : labels.unavailable}</div>
          )}

          <div className="browse-asset-quote">
            <p className="browse-asset-price">{prettyPrice(detailState.latest, locale)}</p>
            <p className={`browse-asset-change ${detailTone}`}>{pctText(detailState.change, locale)}</p>
          </div>

          <div className="browse-asset-actions">
            <button
              type="button"
              className={`primary-btn browse-watch-button ${isWatched ? 'is-active' : ''}`}
              onClick={() =>
                setWatchlist?.((current) => {
                  const safeCurrent = Array.isArray(current) ? current : [];
                  return safeCurrent.includes(watchSymbol) ? safeCurrent : [...safeCurrent, watchSymbol];
                })
              }
            >
              {isWatched ? labels.watched : labels.addToWatchlist}
            </button>
            {isWatched ? (
              <button type="button" className="secondary-btn browse-watch-secondary" onClick={() => onOpenMy?.()}>
                {labels.openMy}
              </button>
            ) : null}
          </div>
        </section>

        <section className="browse-detail-grid">
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.whatThisIs}</p>
            <p className="browse-detail-copy">
              {activeResult.market === 'CRYPTO'
                ? `${activeResult.name}${detailState.resolvedSymbol ? ` · ${detailState.resolvedSymbol}` : ''}`
                : `${activeResult.name}${activeResult.venue ? ` · ${activeResult.venue}` : ''}`}
            </p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.todayTrend}</p>
            <p className="browse-detail-copy">{detailState.note || labels.unavailable}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.openingPrice}</p>
            <p className="browse-detail-copy">{prettyPrice(detailState.open, locale)}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.sessionRange}</p>
            <p className="browse-detail-copy">{detailRangeText}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.pointsSeen}</p>
            <p className="browse-detail-copy">{detailState.values.length || '--'}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.chartSource}</p>
            <p className="browse-detail-copy">{detailRange === '1D' ? labels.liveToday : labels.historicalClose}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.dataSource}</p>
            <p className="browse-detail-copy">{detailSourceText}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.lastUpdated}</p>
            <p className="browse-detail-copy">{detailAsOfText}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.liveStatus}</p>
            <p className="browse-detail-copy">{detailSourceStatusLabel}</p>
          </article>
          <article className="browse-detail-card">
            <p className="browse-detail-label">{labels.whyItShows}</p>
            <p className="browse-detail-copy">{activeResult.hint || labels.unavailable}</p>
          </article>
        </section>

        {detailOverview ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.assetBasics}</h2>
            </div>
            <div className="browse-detail-grid">
              {overviewFactCards.map((item) => (
                <OverviewFactCard key={`${detailOverview.symbol}-${item.label}`} label={item.label} value={item.value} footnote={item.footnote} />
              ))}
              <OverviewFactCard
                label={isZh ? '财报/事件窗口' : 'Earnings / event window'}
                value={detailOverview.earnings?.status || '--'}
                footnote={detailOverview.earnings?.note || null}
              />
            </div>
          </section>
        ) : null}

        {matchingSignals.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.signalContext}</h2>
            </div>
            <div className="browse-signal-list">
              {matchingSignals.map((item) => (
                <SignalIdeaCard key={`detail-signal-${item.symbol}-${item.direction}`} item={item} locale={locale} labels={labels} onOpen={openSymbolResult} />
              ))}
            </div>
          </section>
        ) : null}

        {detailNewsRows.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.topNews}</h2>
            </div>
            <div className="browse-feed-list">
              {detailNewsRows.map((item) => (
                <FeedRow key={`detail-news-${activeResult.symbol}-${item.title}`} item={item} locale={locale} onOpen={openSymbolResult} />
              ))}
            </div>
          </section>
        ) : null}

        {relatedAssets.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.relatedAssets}</h2>
            </div>
            <DetailChipRow items={relatedAssets} onOpen={openSymbolResult} />
          </section>
        ) : null}

        {detailOverview?.relatedEtfs?.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.relatedEtfs}</h2>
            </div>
            <div className="browse-detail-chip-row">
              {detailOverview.relatedEtfs.map((symbol) => (
                <button key={`${activeResult.symbol}-etf-${symbol}`} type="button" className="browse-detail-chip" onClick={() => openSymbolResult(symbol, 'US')}>
                  {symbol}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {detailOverview?.optionEntries?.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.derivatives}</h2>
            </div>
            <div className="browse-signal-list">
              {detailOverview.optionEntries.map((item) => (
                <OverviewFactCard key={`${activeResult.symbol}-deriv-${item.label}`} label={item.label} value={item.description} footnote={activeResult.symbol} />
              ))}
            </div>
          </section>
        ) : null}

        {activeCollections.length ? (
          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.collectionLinks}</h2>
            </div>
            <div className="browse-detail-chip-row">
              {activeCollections.map((item) => (
                <button
                  key={`${activeResult.symbol}-${item.symbol}`}
                  type="button"
                  className="browse-detail-static-chip"
                  onClick={() => {
                    setActiveResult(null);
                    openCollectionPage(item.key);
                  }}
                >
                  {item.symbol}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <section className="stack-gap browse-screen">
      <header className="browse-head">
        <h1 className="browse-title">{labels.title}</h1>
      </header>

      <label className={`browse-search-shell ${showSearchResults ? 'active' : ''}`}>
        <SearchGlyph />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="browse-search-input"
          placeholder={labels.search}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
          aria-label={labels.search}
        />
        {searchValue ? (
          <button type="button" className="browse-search-clear" onClick={() => setSearchValue('')} aria-label={labels.clear}>
            ×
          </button>
        ) : null}
      </label>

      {showSearchResults ? (
        <section className="browse-section browse-search-results">
          <div className="browse-section-head">
            <h2>{labels.results}</h2>
            {searchState === 'ready' ? <span className="browse-search-count">{searchResults.length}</span> : null}
          </div>

          {searchState === 'loading' ? <div className="browse-search-empty">{labels.loading}</div> : null}
          {searchState === 'error' ? <div className="browse-search-empty">{labels.apiOffline}</div> : null}
          {searchState === 'ready' && !searchResults.length ? <div className="browse-search-empty">{labels.noResults}</div> : null}

          {searchState === 'ready' && searchResults.length ? (
            <div className="browse-results-list">
              {searchResults.map((item) => (
                <BrowseResultRow
                  key={`${item.market}:${item.symbol}:${item.source}`}
                  item={item}
                  locale={locale}
                  labels={labels}
                  onOpen={openSearchResult}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <div className="browse-category-row" role="tablist" aria-label={labels.title}>
            {labels.categories.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={category === item.key}
                className={`browse-category-pill ${category === item.key ? 'active' : ''}`}
                onClick={() => setCategory(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <section className="browse-hero-card">
            <div className="browse-hero-copy">
              <p className="browse-hero-kicker">{labels.regimeNow}</p>
              <h2 className="browse-hero-title">{labels.heroTitle}</h2>
              <p className="browse-hero-subtitle">{labels.heroSubtitle}</p>
            </div>
            <div className="browse-hero-metrics">
              <div className="browse-hero-metric">
                <span className="browse-hero-metric-label">{labels.regimeNow}</span>
                <strong>{regimeTag}</strong>
              </div>
              <div className="browse-hero-metric">
                <span className="browse-hero-metric-label">{labels.breadthNow}</span>
                <strong>{Number.isFinite(breadthRatio) ? `${formatNumber(breadthRatio * 100, 0, locale)}%` : '--'}</strong>
              </div>
            </div>
            <p className="browse-hero-footnote">{labels.pulseFootnote}</p>
          </section>

          {marketPulseCards.length ? (
            <section className="browse-section">
              <div className="browse-section-head">
                <h2>{labels.marketPulse}</h2>
              </div>
              <div className="browse-pulse-grid">
                {marketPulseCards.map((item) => (
                  <PulseCard key={`pulse-${item.instrument.ticker}`} item={item} locale={locale} labels={labels} onOpen={openInstrumentResult} />
                ))}
              </div>
            </section>
          ) : null}

          {storyCards.length ? (
            <section className="browse-section">
              <div className="browse-section-head">
                <h2>{labels.marketStories}</h2>
              </div>
              <div className="browse-signal-list">
                {storyCards.map((item) => (
                  <StoryCard key={item.title} item={item} onOpen={openSymbolResult} />
                ))}
              </div>
            </section>
          ) : null}

          {liveFeedRows.length ? (
            <section className="browse-section">
              <div className="browse-section-head">
                <h2>{labels.liveFeed}</h2>
              </div>
              <div className="browse-feed-list">
                {liveFeedRows.map((item) => (
                  <FeedRow key={`feed-${item.symbol}-${item.title}`} item={item} locale={locale} onOpen={openSymbolResult} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.quickAccess}</h2>
            </div>
            {quickAccessCards.length ? (
              <div className="browse-quick-chip-row">
                {quickAccessCards.map((item) => (
                  <QuickAccessChip key={`quick-${item.instrument.ticker}`} item={item} locale={locale} onOpen={openInstrumentResult} />
                ))}
              </div>
            ) : (
              <div className="browse-search-empty">{labels.quickAccessEmpty}</div>
            )}
          </section>

          <section className="browse-section">
            <div className="browse-section-head">
              <h2>{labels.strategyIdeas}</h2>
            </div>
            {signalIdeas.length ? (
              <div className="browse-signal-list">
                {signalIdeas.slice(0, showMacroFocus ? 3 : 4).map((item) => (
                  <SignalIdeaCard key={`signal-idea-${item.symbol}-${item.direction}`} item={item} locale={locale} labels={labels} onOpen={openSymbolResult} />
                ))}
              </div>
            ) : (
              <div className="browse-search-empty">{labels.noSignals}</div>
            )}
          </section>

          {themeCollections.length ? (
            <section className="browse-section">
              <div className="browse-section-head">
                <h2>{labels.collections}</h2>
              </div>
              <div className="browse-collection-grid">
                {themeCollections.map((collection) => (
                  <CollectionCard
                    key={collection.key}
                    collection={collection}
                    locale={locale}
                    onOpen={(target, options) => {
                      if (options?.view === 'collection') {
                        openCollectionPage(target);
                        return;
                      }
                      openInstrumentResult(target);
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {!showSports ? (
            <>
              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.futures}</h2>
                </div>
                <div className="browse-futures-row">
                  {(showCryptoFocus ? crypto.slice(0, 3) : futuresMarkets).map((item) => (
                    <FuturesCard key={item.ticker} item={item} locale={locale} onOpen={openInstrumentResult} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{showCryptoFocus ? labels.cryptoMovers : labels.movers}</h2>
                </div>
                <div className="browse-movers-grid">
                  {(showCryptoFocus ? cryptoMovers : topMovers).map((item) => (
                    <MoverChip key={`${item.symbol}-${item.change}`} item={item} locale={locale} onOpen={openSymbolResult} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.cryptoMovers}</h2>
                </div>
                <div className="browse-movers-grid">
                  {cryptoMovers.map((item) => (
                    <MoverChip key={`crypto-${item.symbol}`} item={item} locale={locale} onOpen={openSymbolResult} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.earnings}</h2>
                </div>
                <div className="browse-earnings-list">
                  {(showMacroFocus ? earningsRows.slice(0, 3) : earningsRows).map((item) => (
                    <EarningsRow key={`${item.symbol}-${item.time}`} item={item} onOpen={openSymbolResult} />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="browse-section">
              <div className="browse-section-head">
                <h2>Sports</h2>
              </div>
              {sportsRows.length ? (
                <div className="browse-movers-grid">
                  {sportsRows.map((item) => (
                    <MoverChip key={`sports-${item.symbol}`} item={item} locale={locale} onOpen={openSymbolResult} />
                  ))}
                </div>
              ) : (
                <div className="browse-sports-empty">{labels.noSports}</div>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../utils/format';

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

function SearchGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="browse-search-glyph" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L16.5 16.5" />
    </svg>
  );
}

function BrowseMiniChart({ values, tone = 'neutral' }) {
  const path = useMemo(() => linePath(values), [values]);
  return (
    <svg viewBox="0 0 176 62" className={`browse-mini-chart browse-mini-chart-${tone}`} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function FuturesCard({ item, locale }) {
  const bars = barsForInstrument(item, 18);
  const values = bars.map((point) => point.close);
  const latest = values[values.length - 1];
  const change = pctChangeFromBars(item);
  const tone = toneForChange(change);
  return (
    <article className="browse-futures-card">
      <div className="browse-futures-copy">
        <p className="browse-futures-title">{item.display || item.ticker}</p>
        <p className="browse-futures-subtitle">{item.contract || item.label}</p>
      </div>
      <BrowseMiniChart values={values} tone={tone} />
      <div className="browse-futures-footer">
        <p className="browse-futures-price">{prettyPrice(latest, locale)}</p>
        <p className={`browse-futures-change ${tone}`}>{pctText(change, locale)}</p>
      </div>
    </article>
  );
}

function MoverChip({ item, locale }) {
  const tone = toneForChange(item.change);
  return (
    <div className={`browse-mover-chip browse-mover-chip-${tone}`}>
      <span className="browse-mover-symbol">{item.symbol}</span>
      <span className="browse-mover-change">{pctText(item.change, locale)}</span>
    </div>
  );
}

function EarningsRow({ item }) {
  return (
    <div className="browse-earnings-row">
      <div>
        <p className="browse-earnings-symbol">{item.symbol}</p>
        <p className="browse-earnings-caption">{item.note}</p>
      </div>
      <span className="browse-earnings-time">{item.time}</span>
    </div>
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
  const [detailState, setDetailState] = useState({
    loading: false,
    values: [],
    latest: null,
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
      whatThisIs: isZh ? '这是什么' : 'What this is',
      whyItShows: isZh ? '为什么会出现' : 'Why it surfaced',
      todayTrend: isZh ? '今日走势' : 'Today',
      dataSource: isZh ? '数据来源' : 'Data source',
      lastUpdated: isZh ? '最后更新' : 'Last updated',
      liveStatus: isZh ? '实时状态' : 'Status',
      liveNow: isZh ? '实时 / 当日分时' : 'Live intraday',
      cached: isZh ? '缓存 / 最近可用' : 'Latest cached',
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
        const response = await fetch(
          `/api/assets/search?q=${encodeURIComponent(trimmedQuery)}&limit=24`,
          {
            credentials: 'same-origin'
          }
        );
        if (!response.ok) {
          throw new Error(`search failed (${response.status})`);
        }
        const payload = await response.json();
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
    if (!activeResult) {
      setDetailState({
        loading: false,
        values: [],
        latest: null,
        change: null,
        asOf: null,
        source: null,
        sourceStatus: null,
        note: '',
        resolvedSymbol: null
      });
      return undefined;
    }

    let cancelled = false;
    setDetailState((current) => ({
      ...current,
      loading: true,
      values: [],
      latest: null,
      change: null,
      asOf: null,
      source: null,
      sourceStatus: null,
      note: '',
      resolvedSymbol: null
    }));
    void fetch(
      `/api/browse/chart?market=${encodeURIComponent(activeResult.market)}&symbol=${encodeURIComponent(activeResult.symbol)}`,
      {
        credentials: 'same-origin'
      }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`ohlcv failed (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const chart = payload?.data || {};
        const values = Array.isArray(chart?.points)
          ? chart.points.map((point) => asNumber(point?.close)).filter((value) => Number.isFinite(value))
          : [];
        setDetailState({
          loading: false,
          values,
          latest: asNumber(chart?.latest),
          change: asNumber(chart?.change),
          asOf: chart?.asOf || null,
          source: chart?.source || null,
          sourceStatus: chart?.sourceStatus || null,
          note: chart?.note || '',
          resolvedSymbol: chart?.resolvedSymbol || null
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetailState({
          loading: false,
          values: [],
          latest: null,
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

  const nonCrypto = useMemo(
    () => instruments.filter((item) => item.ticker && item.assetClass !== 'CRYPTO'),
    [instruments]
  );
  const crypto = useMemo(
    () => instruments.filter((item) => item.ticker && item.assetClass === 'CRYPTO'),
    [instruments]
  );

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

  const showSports = category === 'sports';
  const showCryptoFocus = category === 'crypto';
  const showMacroFocus = category === 'macro';
  const watchSymbol = String(detailState.resolvedSymbol || activeResult?.symbol || '').toUpperCase();
  const isWatched = Boolean(activeResult && watchSymbol && normalizedWatchlist.includes(watchSymbol));
  const detailTone = toneForChange(detailState.change);
  const detailSourceStatusLabel = detailState.sourceStatus === 'LIVE' ? labels.liveNow : labels.cached;
  const detailSourceText = detailState.source || '--';
  const detailAsOfText = formatAsOfLabel(detailState.asOf, locale);

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
              <BrowseMiniChart values={detailState.values} tone={detailTone} />
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
          {searchState === 'error' ? <div className="browse-search-empty">{labels.offline}</div> : null}
          {searchState === 'ready' && !searchResults.length ? <div className="browse-search-empty">{labels.noResults}</div> : null}

          {searchState === 'ready' && searchResults.length ? (
            <div className="browse-results-list">
              {searchResults.map((item) => (
                <BrowseResultRow
                  key={`${item.market}:${item.symbol}:${item.source}`}
                  item={item}
                  locale={locale}
                  labels={labels}
                  onOpen={setActiveResult}
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

          {!showSports ? (
            <>
              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.futures}</h2>
                </div>
                <div className="browse-futures-row">
                  {(showCryptoFocus ? crypto.slice(0, 3) : futuresMarkets).map((item) => (
                    <FuturesCard key={item.ticker} item={item} locale={locale} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{showCryptoFocus ? labels.cryptoMovers : labels.movers}</h2>
                </div>
                <div className="browse-movers-grid">
                  {(showCryptoFocus ? cryptoMovers : topMovers).map((item) => (
                    <MoverChip key={`${item.symbol}-${item.change}`} item={item} locale={locale} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.cryptoMovers}</h2>
                </div>
                <div className="browse-movers-grid">
                  {cryptoMovers.map((item) => (
                    <MoverChip key={`crypto-${item.symbol}`} item={item} locale={locale} />
                  ))}
                </div>
              </section>

              <section className="browse-section">
                <div className="browse-section-head">
                  <h2>{labels.earnings}</h2>
                </div>
                <div className="browse-earnings-list">
                  {(showMacroFocus ? earningsRows.slice(0, 3) : earningsRows).map((item) => (
                    <EarningsRow key={`${item.symbol}-${item.time}`} item={item} />
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
                    <MoverChip key={`sports-${item.symbol}`} item={item} locale={locale} />
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

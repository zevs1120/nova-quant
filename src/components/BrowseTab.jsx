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

function BrowseResultRow({ item, locale, labels }) {
  const isZh = locale?.startsWith('zh');
  const marketLabel = item.market === 'CRYPTO' ? (isZh ? '加密' : 'Crypto') : isZh ? '美股' : 'Stock';
  const sourceLabel = item.source === 'live' ? labels.live : labels.reference;
  const subtitle = item.name && item.name !== item.symbol ? item.name : item.hint;

  return (
    <article className="browse-result-row">
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
    </article>
  );
}

export default function BrowseTab({ locale, marketInstruments = [], signals = [], insights = {} }) {
  const [category, setCategory] = useState('now');
  const [searchValue, setSearchValue] = useState('');
  const [searchState, setSearchState] = useState('idle');
  const [searchResults, setSearchResults] = useState([]);
  const isZh = locale?.startsWith('zh');
  const trimmedQuery = normalizeQuery(searchValue);
  const showSearchResults = trimmedQuery.length > 0;

  const labels = useMemo(
    () => ({
      title: isZh ? '发现' : 'Browse',
      search: isZh ? '搜索股票或加密货币' : 'Search stocks or crypto',
      results: isZh ? '搜索结果' : 'Results',
      noResults: isZh ? '暂时没找到这个代码，试试 ticker 或主流加密符号。' : 'Nothing matched yet. Try a ticker or crypto symbol.',
      offline: isZh ? '搜索暂时不可用，请稍后重试。' : 'Search is temporarily unavailable.',
      loading: isZh ? '正在搜索…' : 'Searching…',
      clear: isZh ? '清除' : 'Clear',
      live: isZh ? '实时池' : 'Live',
      reference: isZh ? '扩展池' : 'Universe',
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

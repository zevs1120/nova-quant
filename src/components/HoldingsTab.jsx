import { useEffect, useMemo, useRef, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import { formatNumber } from '../utils/format';
import { SAMPLE_HOLDINGS_TEMPLATE } from '../research/holdingsAnalyzer';
import { fetchApiJson } from '../utils/api';
import { upsertImportedHoldings } from '../utils/holdingsSource';

function asSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function currencyText(value, locale) {
  if (!Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function signedMoney(value, locale) {
  if (!Number.isFinite(Number(value))) return '--';
  const amount = Number(value);
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${currencyText(Math.abs(amount), locale)}`.replace('$', `${prefix}$`);
}

function signedPercent(value, locale) {
  if (!Number.isFinite(Number(value))) return '--';
  const pct = Number(value) * 100;
  const prefix = pct > 0 ? '+' : '';
  return `${prefix}${formatNumber(pct, 1, locale)}%`;
}

function pnlToneClass(value) {
  if (!Number.isFinite(Number(value))) return '';
  return Number(value) < 0 ? 'negative' : 'positive';
}

function adviceInfo(row, locale) {
  if (row.system_status === 'contradicted') {
    return {
      tone: 'caution',
      badge: locale === 'zh' ? '减仓' : 'Reduce',
    };
  }
  if (row.system_status === 'not_supported') {
    return {
      tone: 'watch',
      badge: locale === 'zh' ? '观望' : 'Caution',
    };
  }
  if (row.system_status === 'aligned') {
    return {
      tone: 'favored',
      badge: locale === 'zh' ? '偏好' : 'Favored',
    };
  }
  return {
    tone: 'neutral',
    badge: locale === 'zh' ? '中性' : 'Neutral',
  };
}

function hashSeed(input) {
  return Array.from(String(input || '')).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

const RANGE_POINTS = {
  '1D': 2,
  '1W': 6,
  '1M': 22,
  '3M': 66,
  '1Y': 140,
  ALL: Infinity,
};

function buildSeries(base, delta, seed, points = 26) {
  const safeBase = Number.isFinite(base) && base > 0 ? base : 1;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Array.from({ length: points }, (_, index) => {
    const progress = points === 1 ? 1 : index / (points - 1);
    const wave =
      Math.sin(progress * Math.PI * (1.7 + (seed % 3) * 0.15)) * (0.018 + (seed % 5) * 0.002);
    const jitter = Math.cos(progress * Math.PI * (2.1 + (seed % 4) * 0.12)) * 0.009;
    const trend = safeDelta * (progress - 0.48) * 0.42;
    return safeBase * (1 + wave + jitter + trend);
  });
}

function linePath(values, width = 320, height = 88) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function MiniSparkline({ values, className = '' }) {
  const path = useMemo(() => linePath(values), [values]);
  return (
    <svg
      viewBox="0 0 320 88"
      className={`holdings-sparkline ${className}`.trim()}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function companyLabel(row, locale) {
  const note = String(row.note || '').trim();
  if (note) return note;
  if (row.asset_class === 'CRYPTO') return locale === 'zh' ? '加密仓位' : 'Crypto position';
  if (row.asset_class === 'OPTIONS') return locale === 'zh' ? '期权仓位' : 'Options position';
  return locale === 'zh' ? '股票仓位' : 'Equity position';
}

function quantityLabel(row, locale) {
  if (!Number.isFinite(Number(row.quantity)))
    return locale === 'zh' ? '份额待补充' : 'Add quantity';
  const digits = row.asset_class === 'CRYPTO' ? 4 : Number.isInteger(Number(row.quantity)) ? 0 : 2;
  const unit =
    row.asset_class === 'CRYPTO'
      ? locale === 'zh'
        ? '枚'
        : 'units'
      : locale === 'zh'
        ? '份'
        : 'shares';
  return `${formatNumber(row.quantity, digits, locale)} ${unit}`;
}

function sourceLabel(row, locale) {
  const explicit = String(row.source_label || '').trim();
  if (explicit) return explicit;
  if (row.source_kind === 'CSV') return locale === 'zh' ? 'CSV 导入' : 'CSV import';
  if (row.source_kind === 'SCREENSHOT') return locale === 'zh' ? '截图导入' : 'Screenshot import';
  if (row.source_kind === 'LIVE') return locale === 'zh' ? '只读同步' : 'Read-only sync';
  return null;
}

function holdingMeta(row, locale) {
  return [companyLabel(row, locale), quantityLabel(row, locale), sourceLabel(row, locale)]
    .filter(Boolean)
    .join(' · ');
}

function barDate(bar) {
  return String(bar?.date || bar?.ts_open || '');
}

function closeSeries(instrument, range) {
  const bars = Array.isArray(instrument?.bars) ? instrument.bars : [];
  if (!bars.length) return [];
  const count = RANGE_POINTS[range] ?? 22;
  const sliced = Number.isFinite(count) ? bars.slice(-count) : bars.slice();
  return sliced
    .map((bar) => ({
      date: barDate(bar),
      close: Number(bar?.close),
    }))
    .filter((row) => row.date && Number.isFinite(row.close));
}

function deriveUnits(row, latestClose) {
  const quantity = Number(row?.quantity);
  if (Number.isFinite(quantity) && quantity > 0) return quantity;

  const marketValue = Number(row?.market_value);
  if (Number.isFinite(marketValue) && Number.isFinite(latestClose) && latestClose > 0) {
    return marketValue / latestClose;
  }

  const weight = Number(row?.effective_weight_pct);
  if (Number.isFinite(weight) && Number.isFinite(latestClose) && latestClose > 0) {
    return weight / latestClose;
  }

  return null;
}

function realHoldingSeries(row, instrument, range) {
  const series = closeSeries(instrument, range);
  if (!series.length) return [];
  const latestClose = series[series.length - 1]?.close;
  const units = deriveUnits(row, latestClose);
  if (!Number.isFinite(units) || units <= 0) return [];
  return series.map((point) => point.close * units);
}

function realPortfolioSeries(rows, instrumentMap, range) {
  const perHolding = rows
    .map((row) => {
      const instrument = instrumentMap.get(asSymbol(row.symbol));
      const series = closeSeries(instrument, range);
      if (!series.length) return null;
      const latestClose = series[series.length - 1]?.close;
      const units = deriveUnits(row, latestClose);
      if (!Number.isFinite(units) || units <= 0) return null;
      return {
        units,
        series,
      };
    })
    .filter(Boolean);

  if (!perHolding.length) return [];

  const aggregate = new Map();
  for (const item of perHolding) {
    for (const point of item.series) {
      aggregate.set(point.date, (aggregate.get(point.date) || 0) + point.close * item.units);
    }
  }

  return Array.from(aggregate.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([, value]) => value);
}

export default function HoldingsTab({
  holdings,
  setHoldings,
  holdingsReview,
  watchlist = [],
  marketInstruments = [],
  locale,
  investorDemoEnabled,
  holdingsSource,
  manualHoldingsCount = 0,
  canRefreshConnectedHoldings = false,
  onRefreshHoldings,
  onExplain,
}) {
  const [surfaceTab, setSurfaceTab] = useState('holdings');
  const [range, setRange] = useState('1M');
  const [busyAction, setBusyAction] = useState('');
  const [importFeedback, setImportFeedback] = useState(null);
  const csvInputRef = useRef(null);
  const screenshotInputRef = useRef(null);

  const instrumentMap = useMemo(
    () => new Map((marketInstruments || []).map((item) => [asSymbol(item.ticker), item])),
    [marketInstruments],
  );

  useEffect(() => {
    if (!holdings?.length) return;
    if (holdings.every((item) => item.id)) return;
    setHoldings((current) =>
      current.map((item, index) => ({
        ...item,
        id: item.id || `holding-${index + 1}-${asSymbol(item.symbol)}`,
      })),
    );
  }, [holdings, setHoldings]);

  const rows = holdingsReview?.rows || [];
  const totals = holdingsReview?.totals || {};
  const keyAdvice =
    holdingsReview?.key_advice ||
    (locale === 'zh'
      ? '先把仓位读进来，Nova 才能给你个性化建议。'
      : 'Load your holdings first so Nova can personalize the advice.');
  const topRisk =
    holdingsReview?.risk?.primary_risks?.[0] ||
    (locale === 'zh'
      ? '先把真实仓位接进来，再判断今天该留什么、减什么。'
      : 'Bring in your real positions first, then decide what to keep or trim.');
  const totalValue = currencyText(totals.total_market_value, locale);
  const totalPnlAmount = signedMoney(totals.total_unrealized_pnl_amount, locale);
  const totalPnlPct = signedPercent(totals.estimated_unrealized_pnl_pct, locale);
  const totalPnlTone = pnlToneClass(totals.estimated_unrealized_pnl_pct);

  const timeframeOptions = useMemo(() => ['1D', '1W', '1M', '3M', '1Y', 'ALL'], []);

  const overviewSeries = useMemo(() => {
    const realSeries = realPortfolioSeries(rows, instrumentMap, range);
    if (realSeries.length >= 2) return realSeries;
    if (!investorDemoEnabled) return [];
    const base = Number(totals.total_market_value || rows.length * 1000 || 1000);
    const delta = Number(totals.estimated_unrealized_pnl_pct || 0);
    const seed = rows.reduce((sum, row) => sum + hashSeed(row.symbol), 0) + hashSeed(range);
    return buildSeries(base, delta, seed, 28);
  }, [
    rows,
    totals.total_market_value,
    totals.estimated_unrealized_pnl_pct,
    instrumentMap,
    investorDemoEnabled,
    range,
  ]);

  const listRows = useMemo(
    () =>
      rows.map((row) => {
        const realSeries = realHoldingSeries(
          row,
          instrumentMap.get(asSymbol(row.symbol)),
          range,
        ).slice(-14);
        return {
          ...row,
          advice: adviceInfo(row, locale),
          sparkline:
            realSeries.length >= 2
              ? realSeries
              : investorDemoEnabled
                ? buildSeries(
                    Number(row.market_value || row.current_price || 1),
                    Number(row.pnl_pct || 0),
                    hashSeed(`${row.symbol}:${range}`),
                    14,
                  )
                : [],
        };
      }),
    [rows, locale, instrumentMap, investorDemoEnabled, range],
  );

  const watchlistRows = useMemo(() => {
    const symbols = (watchlist || []).map((item) => asSymbol(item)).filter(Boolean);
    const held = new Set(rows.map((row) => asSymbol(row.symbol)));
    return symbols
      .filter((symbol) => !held.has(symbol))
      .map((symbol) => {
        const realSeries = closeSeries(instrumentMap.get(symbol), range)
          .map((point) => point.close)
          .slice(-14);
        return {
          symbol,
          label: locale === 'zh' ? '观察中' : 'Watching',
          sparkline:
            realSeries.length >= 2
              ? realSeries
              : investorDemoEnabled
                ? buildSeries(100, 0, hashSeed(`${symbol}:watch`), 14)
                : [],
        };
      });
  }, [watchlist, rows, locale, instrumentMap, investorDemoEnabled, range]);

  const emptyList = surfaceTab === 'holdings' ? !listRows.length : !watchlistRows.length;

  async function importCsvFile(file) {
    if (!file) return;
    setBusyAction('csv');
    setImportFeedback(null);
    try {
      const csvText = await file.text();
      const payload = await fetchApiJson('/api/holdings/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText,
          filename: file.name,
        }),
      });
      const importedHoldings = Array.isArray(payload?.holdings) ? payload.holdings : [];
      if (!importedHoldings.length) {
        throw new Error(
          locale === 'zh'
            ? '没有识别到可导入的持仓行。'
            : 'No recognizable holdings rows were found.',
        );
      }
      setHoldings((current) => upsertImportedHoldings(current, importedHoldings));
      setSurfaceTab('holdings');
      const warnings = Array.isArray(payload?.summary?.warnings)
        ? payload.summary.warnings.filter(Boolean)
        : [];
      setImportFeedback({
        tone: 'success',
        message:
          locale === 'zh'
            ? `已从 ${file.name} 导入 ${importedHoldings.length} 个持仓。`
            : `Imported ${importedHoldings.length} holdings from ${file.name}.`,
        detail: warnings[0] || '',
      });
    } catch (error) {
      setImportFeedback({
        tone: 'error',
        message: String(
          error?.message || (locale === 'zh' ? 'CSV 导入失败。' : 'CSV import failed.'),
        ),
        detail: '',
      });
    } finally {
      setBusyAction('');
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  async function importScreenshotFile(file) {
    if (!file) return;
    setBusyAction('screenshot');
    setImportFeedback(null);
    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () =>
          reject(new Error(locale === 'zh' ? '截图读取失败。' : 'Failed to read screenshot.'));
        reader.readAsDataURL(file);
      });
      const payload = await fetchApiJson('/api/holdings/import/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl }),
      });
      const importedHoldings = Array.isArray(payload?.holdings) ? payload.holdings : [];
      if (!importedHoldings.length) {
        throw new Error(
          locale === 'zh'
            ? '截图里没有识别出清晰持仓。'
            : 'No clear holdings were recognized from the screenshot.',
        );
      }
      setHoldings((current) => upsertImportedHoldings(current, importedHoldings));
      setSurfaceTab('holdings');
      const warnings = Array.isArray(payload?.summary?.warnings)
        ? payload.summary.warnings.filter(Boolean)
        : [];
      setImportFeedback({
        tone: 'success',
        message:
          locale === 'zh'
            ? `已从截图识别 ${importedHoldings.length} 个持仓。`
            : `Imported ${importedHoldings.length} holdings from the screenshot.`,
        detail:
          warnings[0] ||
          (locale === 'zh'
            ? '截图导入仍是实验功能，请快速核对数量和成本。'
            : 'Screenshot import is still experimental, so please double-check quantity and cost basis.'),
      });
    } catch (error) {
      const message = String(error?.message || '');
      const unavailable =
        message.includes('SCREENSHOT_IMPORT_UNAVAILABLE') || message.includes('OPENAI_API_KEY');
      setImportFeedback({
        tone: 'error',
        message: unavailable
          ? locale === 'zh'
            ? '截图导入当前不可用，先用 CSV 或只读同步。'
            : 'Screenshot import is unavailable right now. Use CSV or read-only sync first.'
          : message || (locale === 'zh' ? '截图导入失败。' : 'Screenshot import failed.'),
        detail: unavailable
          ? locale === 'zh'
            ? '服务端还没有可用的视觉模型配置。'
            : 'The server does not have a vision-capable model configured yet.'
          : '',
      });
    } finally {
      setBusyAction('');
      if (screenshotInputRef.current) screenshotInputRef.current.value = '';
    }
  }

  return (
    <section className="stack-gap holdings-rh-screen">
      <section className="holdings-overview-surface">
        <div className="holdings-overview-head">
          <div className="holdings-overview-copy">
            <p className="holdings-overview-kicker">{locale === 'zh' ? '持仓' : 'Holdings'}</p>
            <h1 className="holdings-overview-total">{totalValue}</h1>
            <p className={`holdings-overview-pnl ${totalPnlTone}`}>
              {totalPnlAmount} <span>({totalPnlPct})</span>
            </p>
            {holdingsSource?.message ? (
              <p className="muted status-line">
                {locale === 'zh'
                  ? `来源：${holdingsSource.message}`
                  : `Source: ${holdingsSource.message}`}
              </p>
            ) : null}
          </div>
          {investorDemoEnabled ? (
            <div className="holdings-overview-actions">
              <span className="holdings-overview-demo">{locale === 'zh' ? '演示' : 'Demo'}</span>
            </div>
          ) : null}
        </div>

        <div className="holdings-overview-chart">
          <MiniSparkline values={overviewSeries} />
        </div>

        <div className="holdings-overview-range">
          {timeframeOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`holdings-range-pill ${range === option ? 'active' : ''}`}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="holdings-priority-surface">
        <p className="holdings-priority-kicker">
          {locale === 'zh' ? '最重要的一句' : 'Most important next step'}
        </p>
        <h2 className="holdings-priority-title">{keyAdvice}</h2>
        <p className="holdings-priority-copy">{topRisk}</p>
        <div className="action-row holdings-priority-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() =>
              onExplain?.(
                locale === 'zh'
                  ? '用一句话告诉我，我当前持仓里最需要先处理的一件事是什么。'
                  : 'Tell me in one sentence what I should fix first in my current holdings.',
              )
            }
          >
            {locale === 'zh' ? '让 Nova 解释' : 'Ask Nova'}
          </button>
        </div>
      </section>

      <section className="holdings-import-surface">
        <div className="holdings-import-head">
          <div>
            <p className="holdings-import-kicker">
              {locale === 'zh' ? '读入你的仓位' : 'Load your positions'}
            </p>
            <h2 className="holdings-import-title">
              {locale === 'zh'
                ? '先把仓位接进来，再谈动作。'
                : 'Bring positions in before making calls.'}
            </h2>
          </div>
          {manualHoldingsCount > 0 ? (
            <span className="holdings-import-badge">
              {locale === 'zh'
                ? `已导入 ${manualHoldingsCount}`
                : `${manualHoldingsCount} imported`}
            </span>
          ) : null}
        </div>
        <p className="holdings-import-copy">
          {holdingsSource?.message ||
            (locale === 'zh'
              ? '支持只读同步、CSV 导入和截图识别。'
              : 'Use read-only sync, CSV import, or screenshot import.')}
        </p>
        <div className="action-row holdings-import-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setBusyAction('refresh');
              onRefreshHoldings?.();
              window.setTimeout(() => setBusyAction(''), 900);
            }}
            disabled={!canRefreshConnectedHoldings || Boolean(busyAction)}
          >
            {busyAction === 'refresh'
              ? locale === 'zh'
                ? '刷新中...'
                : 'Refreshing...'
              : locale === 'zh'
                ? '刷新只读同步'
                : 'Refresh read-only'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => csvInputRef.current?.click()}
            disabled={Boolean(busyAction)}
          >
            {busyAction === 'csv'
              ? locale === 'zh'
                ? '导入中...'
                : 'Importing...'
              : locale === 'zh'
                ? '导入 CSV'
                : 'Import CSV'}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => screenshotInputRef.current?.click()}
            disabled={Boolean(busyAction)}
          >
            {busyAction === 'screenshot'
              ? locale === 'zh'
                ? '识别中...'
                : 'Reading...'
              : locale === 'zh'
                ? '导入截图'
                : 'Import screenshot'}
          </button>
          {manualHoldingsCount > 0 ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setHoldings([]);
                setImportFeedback({
                  tone: 'success',
                  message:
                    locale === 'zh' ? '已清空手动导入的仓位。' : 'Cleared imported holdings.',
                  detail: '',
                });
              }}
              disabled={Boolean(busyAction)}
            >
              {locale === 'zh' ? '清空导入' : 'Clear imports'}
            </button>
          ) : null}
        </div>
        {importFeedback?.message ? (
          <p
            className={`status-line holdings-import-status holdings-import-status-${importFeedback.tone || 'neutral'}`}
          >
            {importFeedback.message}
          </p>
        ) : null}
        {importFeedback?.detail ? (
          <p className="muted holdings-import-detail">{importFeedback.detail}</p>
        ) : null}
        {!canRefreshConnectedHoldings && !investorDemoEnabled ? (
          <p className="muted holdings-import-detail">
            {locale === 'zh'
              ? '登录并配置可用连接后，Nova 才能刷新只读仓位。'
              : 'Sign in and configure a supported connection before refreshing read-only holdings.'}
          </p>
        ) : null}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          hidden
          onChange={(event) => {
            void importCsvFile(event.target.files?.[0] || null);
          }}
        />
        <input
          ref={screenshotInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void importScreenshotFile(event.target.files?.[0] || null);
          }}
        />
      </section>

      <section className="holdings-switch-row">
        <SegmentedControl
          options={[
            { label: locale === 'zh' ? '持仓' : 'Holdings', value: 'holdings' },
            { label: locale === 'zh' ? '观察列表' : 'Watchlist', value: 'watchlist' },
          ]}
          value={surfaceTab}
          onChange={setSurfaceTab}
          compact
        />
      </section>

      <section className="holdings-list-surface-rh">
        {emptyList ? (
          <div className="holdings-empty-state">
            <p className="holdings-empty-title">
              {surfaceTab === 'holdings'
                ? locale === 'zh'
                  ? holdingsSource?.connected
                    ? '当前没有真实持仓。'
                    : '还没有连接真实持仓源。'
                  : holdingsSource?.connected
                    ? 'No live holdings right now.'
                    : 'No live holdings source connected yet.'
                : locale === 'zh'
                  ? '观察列表还是空的。'
                  : 'Your watchlist is empty.'}
            </p>
            <p className="holdings-empty-copy">
              {surfaceTab === 'holdings'
                ? locale === 'zh'
                  ? holdingsSource?.connected
                    ? '已连接真实账户，但当前没有回传持仓。'
                    : '先连接 broker 或 exchange，Nova 才能读取真实组合。'
                  : holdingsSource?.connected
                    ? 'Your connected accounts reported no open positions.'
                    : 'Connect a broker or exchange so Nova can read real holdings.'
                : locale === 'zh'
                  ? '先在 Today 页把标的加入观察。'
                  : 'Add names from Today first.'}
            </p>
            {surfaceTab === 'holdings' ? (
              <div className="action-row holdings-empty-actions">
                {investorDemoEnabled ? (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() =>
                      setHoldings(
                        SAMPLE_HOLDINGS_TEMPLATE.map((item, index) => ({
                          ...item,
                          id: `example-${index + 1}`,
                        })),
                      )
                    }
                  >
                    {locale === 'zh' ? '加载示例' : 'Load example'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : surfaceTab === 'holdings' ? (
          <div className="holdings-rh-list">
            {listRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="holdings-rh-row"
                onClick={() =>
                  onExplain?.(
                    locale === 'zh'
                      ? `帮我看一下 ${row.symbol} 现在应该继续拿着、减仓，还是卖掉。`
                      : `Review ${row.symbol}. Should I keep it, trim it, or sell it?`,
                  )
                }
              >
                <div className="holdings-rh-row-left">
                  <div className="holdings-rh-symbol-line">
                    <span className="holdings-rh-symbol">{row.symbol}</span>
                    <span className={`holdings-rh-ai-tag holdings-rh-ai-tag-${row.advice.tone}`}>
                      {row.advice.badge}
                    </span>
                  </div>
                  <p className="holdings-rh-meta">{holdingMeta(row, locale)}</p>
                </div>

                <div className="holdings-rh-row-spark">
                  <MiniSparkline
                    values={row.sparkline}
                    className={`holdings-sparkline-${row.advice.tone}`}
                  />
                </div>

                <div className="holdings-rh-row-right">
                  <p className="holdings-rh-market">{currencyText(row.market_value, locale)}</p>
                  <p className={`holdings-rh-pnl ${pnlToneClass(row.pnl_pct)}`}>
                    {signedMoney(row.pnl_amount, locale)}
                    {' · '}
                    {signedPercent(row.pnl_pct, locale)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="holdings-rh-list">
            {watchlistRows.map((row) => (
              <button
                key={row.symbol}
                type="button"
                className="holdings-rh-row holdings-rh-watch-row"
                onClick={() =>
                  onExplain?.(
                    locale === 'zh'
                      ? `帮我看一下 ${row.symbol} 今天值不值得继续关注。`
                      : `Review ${row.symbol}. Is it worth staying on watch today?`,
                  )
                }
              >
                <div className="holdings-rh-row-left">
                  <div className="holdings-rh-symbol-line">
                    <span className="holdings-rh-symbol">{row.symbol}</span>
                    <span className="holdings-rh-ai-tag holdings-rh-ai-tag-watch">{row.label}</span>
                  </div>
                  <p className="holdings-rh-meta">
                    {locale === 'zh' ? '来自你的观察列表' : 'From your watchlist'}
                  </p>
                </div>
                <div className="holdings-rh-row-spark">
                  <MiniSparkline values={row.sparkline} className="holdings-sparkline-watch" />
                </div>
                <div className="holdings-rh-row-right">
                  <p className="holdings-rh-market">{locale === 'zh' ? '已跟踪' : 'Tracked'}</p>
                  <p className="holdings-rh-pnl neutral">
                    {locale === 'zh' ? '等待判断' : 'Waiting on a call'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

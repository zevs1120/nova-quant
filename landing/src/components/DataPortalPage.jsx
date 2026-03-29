import { useEffect, useRef, useState } from 'react';
import {
  portalBacktestMetrics,
  portalBenchmarkComparison,
  portalCurveBars,
  portalFabricLanes,
  portalFlywheelSteps,
  portalHeroStats,
  portalHeatmapMonths,
  portalMonthlyHeatmap,
  portalMonteCarloPaths,
  portalMonteCarloStats,
} from '../data/index.js';
import { useMotionPreference, useViewportReveal } from '../hooks/useViewportMotion.js';

const PORTAL_MONTE_CARLO_WIDTH = 320;
const PORTAL_MONTE_CARLO_HEIGHT = 188;

const PORTAL_TIME_WINDOWS = [
  {
    id: '1y',
    label: '1Y',
    summary: 'Latest cycle',
    strategyReturn: 31,
    sharpe: 1.47,
    maxDrawdown: 7.4,
    hitRate: 60,
    curveScale: 0.46,
    forecastScale: 0.72,
    defaultYear: '2026 YTD',
    benchmarks: { sp500: 18, nasdaq: 23, balanced: 13 },
  },
  {
    id: '3y',
    label: '3Y',
    summary: 'Recent regimes',
    strategyReturn: 82,
    sharpe: 1.54,
    maxDrawdown: 9.5,
    hitRate: 59,
    curveScale: 0.68,
    forecastScale: 0.84,
    defaultYear: '2025',
    benchmarks: { sp500: 47, nasdaq: 61, balanced: 36 },
  },
  {
    id: '5y',
    label: '5Y',
    summary: 'Multi-cycle',
    strategyReturn: 121,
    sharpe: 1.58,
    maxDrawdown: 10.7,
    hitRate: 59,
    curveScale: 0.84,
    forecastScale: 0.92,
    defaultYear: '2024',
    benchmarks: { sp500: 73, nasdaq: 96, balanced: 57 },
  },
  {
    id: '10y',
    label: '10Y',
    summary: 'Long arc',
    strategyReturn: 142,
    sharpe: 1.6,
    maxDrawdown: 11.4,
    hitRate: 59,
    curveScale: 0.94,
    forecastScale: 0.98,
    defaultYear: '2024',
    benchmarks: { sp500: 89, nasdaq: 115, balanced: 69 },
  },
  {
    id: 'si',
    label: 'Since Inception',
    summary: 'Full memory',
    strategyReturn: 151,
    sharpe: 1.61,
    maxDrawdown: 11.8,
    hitRate: 59,
    curveScale: 1,
    forecastScale: 1,
    defaultYear: '2026 YTD',
    benchmarks: { sp500: 98, nasdaq: 126, balanced: 76 },
  },
];

const PORTAL_BENCHMARK_OPTIONS = [
  { id: 'sp500', label: 'S&P 500', tone: 'blue' },
  { id: 'nasdaq', label: 'Nasdaq', tone: 'pink' },
  { id: 'balanced', label: '60/40', tone: 'yellow' },
];

const PORTAL_MODE_OPTIONS = [
  {
    id: 'live',
    label: 'Live',
    blurb: 'Production context',
    returnDelta: 0,
    sharpeDelta: 0,
    maxDrawdownDelta: 0,
    hitRateDelta: 0,
    forecastScale: 0.96,
    note: 'Live gating and execution friction included.',
  },
  {
    id: 'backtest',
    label: 'Backtest',
    blurb: 'Walk-forward set',
    returnDelta: 4,
    sharpeDelta: 0.03,
    maxDrawdownDelta: -0.4,
    hitRateDelta: 1,
    forecastScale: 1.02,
    note: 'Walk-forward slices blended across parameter packs.',
  },
  {
    id: 'replay',
    label: 'Replay',
    blurb: 'Decision memory',
    returnDelta: 2,
    sharpeDelta: 0.05,
    maxDrawdownDelta: -0.7,
    hitRateDelta: 1,
    forecastScale: 1.05,
    note: 'Historical decisions reconstructed with execution context.',
  },
];

const PORTAL_SCENARIO_OPTIONS = [
  {
    id: 'base',
    label: 'Base',
    pathScale: 1,
    terminalLift: 0,
    positiveDelta: 0,
    note: 'Base assumptions from the current regime mix.',
  },
  {
    id: 'stress',
    label: 'Stress',
    pathScale: 0.84,
    terminalLift: -8,
    positiveDelta: -10,
    note: 'Higher volatility, weaker breadth, slower follow-through.',
  },
  {
    id: 'bull',
    label: 'Bull',
    pathScale: 1.15,
    terminalLift: 8,
    positiveDelta: 8,
    note: 'Leadership holds and breadth confirms sooner.',
  },
];

const PORTAL_BAND_OPTIONS = [
  {
    id: '50',
    label: '50%',
    visible: ['P25', 'Median', 'P75'],
    range: ['P25', 'P75'],
  },
  {
    id: '75',
    label: '75%',
    visible: ['P10', 'P25', 'Median', 'P75'],
    range: ['P10', 'P75'],
  },
  {
    id: '90',
    label: '90%',
    visible: ['P10', 'P25', 'Median', 'P75', 'P90'],
    range: ['P10', 'P90'],
  },
];

const PORTAL_YEAR_BENCHMARK_RETURNS = {
  2023: { sp500: 24, nasdaq: 39, balanced: 16 },
  2024: { sp500: 21, nasdaq: 31, balanced: 15 },
  2025: { sp500: 18, nasdaq: 24, balanced: 13 },
  '2026 YTD': { sp500: 11, nasdaq: 14, balanced: 8 },
};

const PORTAL_BENCHMARK_COMPARISON_ORDER = {
  sp500: ['sp500', 'nasdaq'],
  nasdaq: ['nasdaq', 'sp500'],
  balanced: ['balanced', 'sp500'],
};

const PORTAL_BENCHMARK_NOTES = {
  sp500: 'Broad US equity beta for the same lens.',
  nasdaq: 'Growth-heavy benchmark with higher factor concentration.',
  balanced: '60/40 blended baseline for allocation-aware context.',
};

const PORTAL_PATH_TO_STAT = {
  P10: 'range',
  P25: 'range',
  Median: 'median',
  P75: 'positive',
  P90: 'positive',
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getOption(options, id) {
  return options.find((item) => item.id === id) ?? options[0];
}

function sumValues(values) {
  return values.reduce((total, value) => total + (value ?? 0), 0);
}

function calculateSharpe(values) {
  const validValues = values.filter((value) => value != null);
  if (validValues.length < 2) return 0;

  const mean = validValues.reduce((total, value) => total + value, 0) / validValues.length;
  const variance =
    validValues.reduce((total, value) => total + Math.pow(value - mean, 2), 0) /
    (validValues.length - 1);
  const standardDeviation = Math.sqrt(Math.max(variance, 0));

  if (!Number.isFinite(standardDeviation) || standardDeviation <= 0.0001) return 0;
  return (mean / standardDeviation) * Math.sqrt(12);
}

function calculateMaxDrawdown(values) {
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  values.forEach((value) => {
    if (value == null) return;
    equity *= 1 + value / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  });

  return maxDrawdown;
}

function getHeatmapTone(value) {
  if (value == null) return 'empty';
  if (value >= 4.5) return 'strong-positive';
  if (value > 0) return 'positive';
  if (value <= -2) return 'strong-negative';
  return 'negative';
}

function getHeatmapRegime(value) {
  if (value == null) return 'No data';
  if (value >= 4.5) return 'Trend impulse';
  if (value >= 1.5) return 'Healthy follow-through';
  if (value > 0) return 'Constructive drift';
  if (value <= -2) return 'Risk-off break';
  return 'Shaky tape';
}

function getHeatmapVolatility(value) {
  if (value == null) return 0;
  return Number((Math.abs(value) * 1.7 + 10.5).toFixed(1));
}

function buildCurveHeightsFromSeries(series, scale = 1) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const domain = Math.max(1, max - min);

  return series.map((value) => {
    const normalized = (value - min) / domain;
    return clamp(Math.round((18 + normalized * 72) * scale), 16, 96);
  });
}

function buildReplayCurveFromRow(row, modeProfile) {
  let equity = 100;
  const series = row.values.map((value) => {
    if (value == null) return equity;
    const modeBias = modeProfile.id === 'live' ? 0.98 : modeProfile.id === 'replay' ? 1.03 : 1;
    equity *= 1 + (value * modeBias) / 100;
    return equity;
  });

  return buildCurveHeightsFromSeries(series, 1);
}

function buildScaledCurveBars(scale, modeProfile) {
  const modeScale = modeProfile.id === 'live' ? 0.98 : modeProfile.id === 'replay' ? 1.04 : 1.01;

  return portalCurveBars.map((value, index) =>
    clamp(Math.round((value * scale + index * 0.3) * modeScale), 16, 96),
  );
}

function buildMetricMotion(value, options = {}) {
  return {
    value,
    decimals: options.decimals ?? 0,
    prefix: options.prefix ?? '',
    suffix: options.suffix ?? '',
    duration: options.duration ?? 980,
    from: options.from ?? 0,
  };
}

function buildRangeMotion(start, end, options = {}) {
  return {
    start: buildMetricMotion(start, options),
    end: buildMetricMotion(end, options),
  };
}

function buildMonteCarloPaths(windowProfile, modeProfile, scenarioProfile) {
  const scale = windowProfile.forecastScale * modeProfile.forecastScale * scenarioProfile.pathScale;

  return portalMonteCarloPaths.map((path) => ({
    ...path,
    values: path.values.map((value, index, values) => {
      const progress = index / Math.max(1, values.length - 1);
      const scaled = 100 + (value - 100) * scale + scenarioProfile.terminalLift * progress;
      return Number(clamp(scaled, 86, 220).toFixed(1));
    }),
  }));
}

function buildMonteCarloRange(paths) {
  return paths.reduce(
    (range, path) => ({
      min: Math.min(range.min, ...path.values),
      max: Math.max(range.max, ...path.values),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
}

function buildMonteCarloPath(values, range) {
  const domain = Math.max(1, range.max - range.min);

  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * PORTAL_MONTE_CARLO_WIDTH;
      const y =
        PORTAL_MONTE_CARLO_HEIGHT - ((value - range.min) / domain) * PORTAL_MONTE_CARLO_HEIGHT;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function formatAnimatedValue(value, motion) {
  if (!motion) return '';

  const prefix = motion.prefix ?? '';
  const suffix = motion.suffix ?? '';
  const decimals = motion.decimals ?? 0;
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function useAnimatedMetric(motion, isActive, disabled) {
  const target = motion?.value ?? 0;
  const decimals = motion?.decimals ?? 0;
  const duration = motion?.duration ?? 1000;
  const from = motion?.from ?? 0;
  const prefix = motion?.prefix ?? '';
  const suffix = motion?.suffix ?? '';

  const [currentValue, setCurrentValue] = useState(target);

  useEffect(() => {
    if (!motion) return undefined;

    if (disabled) {
      setCurrentValue(target);
      return undefined;
    }

    if (!isActive) {
      setCurrentValue(from);
      return undefined;
    }

    let rafId = 0;
    let startTime = 0;

    setCurrentValue(from);

    const tick = (timestamp) => {
      if (!startTime) startTime = timestamp;

      const progress = Math.min(1, (timestamp - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = from + (target - from) * easedProgress;

      setCurrentValue(progress >= 1 ? target : nextValue);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [disabled, duration, from, isActive, target]);

  if (!motion) return '';
  return formatAnimatedValue(Number(currentValue.toFixed(decimals)), {
    decimals,
    prefix,
    suffix,
  });
}

function AnimatedMetricValue({ value, motion, isActive, disabled }) {
  const animatedValue = useAnimatedMetric(motion, isActive, disabled);
  return <>{motion ? animatedValue : value}</>;
}

function AnimatedMetricRange({ value, rangeMotion, isActive, disabled }) {
  const startValue = useAnimatedMetric(rangeMotion?.start, isActive, disabled);
  const endValue = useAnimatedMetric(rangeMotion?.end, isActive, disabled);

  if (!rangeMotion) return <>{value}</>;

  return (
    <>
      {startValue}
      {'-'}
      {endValue}
    </>
  );
}

function buildBacktestModel(windowProfile, modeProfile, previewYear) {
  if (previewYear) {
    const totalReturn = Number(sumValues(previewYear.values).toFixed(1));
    const rawSharpe = calculateSharpe(previewYear.values) + modeProfile.sharpeDelta;
    const hitRate =
      (previewYear.values.filter((value) => value != null && value > 0).length /
        Math.max(1, previewYear.values.filter((value) => value != null).length)) *
        100 +
      modeProfile.hitRateDelta;

    return {
      title: `${previewYear.year} replay focus`,
      kicker: `MONTHLY REPLAY / ${previewYear.year}`,
      pill: modeProfile.label.toUpperCase(),
      bars: buildReplayCurveFromRow(previewYear, modeProfile),
      axisLabels: ['Jan', 'Apr', 'Jul', 'Oct', 'Dec'],
      notes: [
        `${previewYear.year} locked to replay`,
        modeProfile.label,
        'Tap any month for detail',
      ],
      secondaryTitle: `${previewYear.year} replay is linked to the heatmap.`,
      secondaryBody:
        'Hovering a month previews the corresponding part of the replay curve. Clicking locks the year and opens evidence.',
      metrics: [
        {
          label: 'Net return',
          value: `${totalReturn >= 0 ? '+' : ''}${Math.round(totalReturn)}%`,
          tone: 'mint',
          motion: buildMetricMotion(Math.round(totalReturn), {
            prefix: totalReturn >= 0 ? '+' : '',
            suffix: '%',
          }),
        },
        {
          label: 'Sharpe',
          value: clamp(rawSharpe, 1.08, 1.82).toFixed(2),
          tone: 'blue',
          motion: buildMetricMotion(Number(clamp(rawSharpe, 1.08, 1.82).toFixed(2)), {
            decimals: 2,
            duration: 920,
          }),
        },
        {
          label: 'Max DD',
          value: `-${calculateMaxDrawdown(previewYear.values).toFixed(1)}%`,
          tone: 'pink',
          motion: buildMetricMotion(-Number(calculateMaxDrawdown(previewYear.values).toFixed(1)), {
            suffix: '%',
            decimals: 1,
            duration: 980,
          }),
        },
        {
          label: 'Hit rate',
          value: `${Math.round(hitRate)}%`,
          tone: 'yellow',
          motion: buildMetricMotion(Math.round(hitRate), { suffix: '%', duration: 1020 }),
        },
      ],
    };
  }

  const netReturn = windowProfile.strategyReturn + modeProfile.returnDelta;
  const sharpe = clamp(windowProfile.sharpe + modeProfile.sharpeDelta, 1.2, 1.85);
  const maxDrawdown = clamp(windowProfile.maxDrawdown + modeProfile.maxDrawdownDelta, 6, 15);
  const hitRate = clamp(windowProfile.hitRate + modeProfile.hitRateDelta, 53, 64);

  return {
    title: `${windowProfile.label} replay`,
    kicker: `REPLAY WINDOW / ${windowProfile.label.toUpperCase()}`,
    pill: modeProfile.label.toUpperCase(),
    bars: buildScaledCurveBars(windowProfile.curveScale, modeProfile),
    axisLabels: ['Start', 'Q1', 'Q2', 'Q3', 'Now'],
    notes: [windowProfile.summary, modeProfile.blurb, 'Hover heatmap to preview a year'],
    secondaryTitle: `${windowProfile.label} is driving the replay window.`,
    secondaryBody:
      'Switching window, mode, or year focus updates the replay bars, metric cards, and evidence panel together.',
    metrics: [
      {
        label: portalBacktestMetrics[0].label,
        value: `+${Math.round(netReturn)}%`,
        tone: 'mint',
        motion: buildMetricMotion(Math.round(netReturn), {
          prefix: '+',
          suffix: '%',
          duration: 1100,
        }),
      },
      {
        label: portalBacktestMetrics[1].label,
        value: sharpe.toFixed(2),
        tone: 'blue',
        motion: buildMetricMotion(Number(sharpe.toFixed(2)), { decimals: 2, duration: 920 }),
      },
      {
        label: portalBacktestMetrics[2].label,
        value: `-${maxDrawdown.toFixed(1)}%`,
        tone: 'pink',
        motion: buildMetricMotion(-Number(maxDrawdown.toFixed(1)), {
          suffix: '%',
          decimals: 1,
          duration: 980,
        }),
      },
      {
        label: portalBacktestMetrics[3].label,
        value: `${Math.round(hitRate)}%`,
        tone: 'yellow',
        motion: buildMetricMotion(Math.round(hitRate), { suffix: '%', duration: 1020 }),
      },
    ],
  };
}

function buildBenchmarkModel(windowProfile, benchmarkId, modeProfile, selectedYear) {
  const benchmarkOption = getOption(PORTAL_BENCHMARK_OPTIONS, benchmarkId);
  const comparisonIds = PORTAL_BENCHMARK_COMPARISON_ORDER[benchmarkId] ?? ['sp500', 'nasdaq'];

  const strategyReturn = selectedYear
    ? Math.round(sumValues(selectedYear.values) + 3)
    : windowProfile.strategyReturn + modeProfile.returnDelta;

  const benchmarkReturns = selectedYear
    ? PORTAL_YEAR_BENCHMARK_RETURNS[selectedYear.year]
    : windowProfile.benchmarks;

  const rows = [
    {
      id: 'strategy',
      label: portalBenchmarkComparison[0].label,
      value: strategyReturn,
      tone: 'ink',
      note: selectedYear
        ? `${selectedYear.year} selected`
        : `${windowProfile.label} ${modeProfile.label.toLowerCase()}`,
    },
    ...comparisonIds.map((id) => ({
      id,
      label: getOption(PORTAL_BENCHMARK_OPTIONS, id).label,
      value: benchmarkReturns[id],
      tone: getOption(PORTAL_BENCHMARK_OPTIONS, id).tone,
      note: selectedYear ? `${selectedYear.year} same period` : PORTAL_BENCHMARK_NOTES[id],
    })),
  ];

  const maxValue = Math.max(...rows.map((item) => item.value));
  const formattedRows = rows.map((item, index) => ({
    ...item,
    valueLabel: `${item.value >= 0 ? '+' : ''}${item.value}%`,
    motion: buildMetricMotion(item.value, {
      prefix: item.value >= 0 ? '+' : '',
      suffix: '%',
      duration: 960 + index * 60,
    }),
    height: clamp(Math.round((item.value / Math.max(1, maxValue)) * 100), 24, 100),
  }));

  const selectedBenchmark =
    formattedRows.find((item) => item.id === benchmarkId) ?? formattedRows[1];
  const alpha = strategyReturn - selectedBenchmark.value;
  const beta = benchmarkId === 'nasdaq' ? 1.18 : benchmarkId === 'balanced' ? 0.74 : 0.96;
  const capture = benchmarkId === 'balanced' ? 132 : benchmarkId === 'nasdaq' ? 109 : 118;

  return {
    rows: formattedRows,
    alpha,
    alphaMotion: buildMetricMotion(alpha, {
      prefix: alpha >= 0 ? '+' : '',
      suffix: ' pts',
      duration: 980,
    }),
    activeBenchmark: benchmarkOption,
    secondaryTitle: `Compared against ${benchmarkOption.label}.`,
    secondaryBody: `${modeProfile.note} Alpha and capture now track the selected benchmark instead of staying static.`,
    beta,
    capture,
    chips: [
      windowProfile.label,
      benchmarkOption.label,
      selectedYear ? selectedYear.year : modeProfile.label,
    ],
  };
}

function buildMonteCarloModel(windowProfile, modeProfile, scenarioId, bandId) {
  const scenarioProfile = getOption(PORTAL_SCENARIO_OPTIONS, scenarioId);
  const bandProfile = getOption(PORTAL_BAND_OPTIONS, bandId);
  const paths = buildMonteCarloPaths(windowProfile, modeProfile, scenarioProfile);
  const range = buildMonteCarloRange(paths);
  const visibleLabels = new Set(bandProfile.visible);
  const rangeLabels = new Set(bandProfile.range);

  const lowerPath = paths.find((path) => rangeLabels.has(path.label)) ?? paths[1];
  const upperPath = [...paths].reverse().find((path) => rangeLabels.has(path.label)) ?? paths[3];
  const medianPath = paths.find((path) => path.label === 'Median') ?? paths[2];

  const medianValue = Math.round(medianPath.values.at(-1));
  const lowerValue = Math.round(lowerPath.values.at(-1));
  const upperValue = Math.round(upperPath.values.at(-1));
  const positivePaths = clamp(
    Math.round(
      portalMonteCarloStats[2].motion.value +
        scenarioProfile.positiveDelta +
        (windowProfile.forecastScale - 1) * 18,
    ),
    52,
    89,
  );

  return {
    paths,
    range,
    visibleLabels,
    secondaryTitle: `${scenarioProfile.label} scenario with a ${bandProfile.label} view.`,
    secondaryBody: `${scenarioProfile.note} The path fan and ending values respond together, not as separate mockups.`,
    stats: [
      {
        id: 'median',
        label: 'Median value',
        value: `$${medianValue}k`,
        tone: 'blue',
        motion: buildMetricMotion(medianValue, { prefix: '$', suffix: 'k', duration: 1080 }),
      },
      {
        id: 'range',
        label: `${bandProfile.label} band`,
        value: `$${lowerValue}k-$${upperValue}k`,
        tone: 'violet',
        rangeMotion: buildRangeMotion(lowerValue, upperValue, {
          prefix: '$',
          suffix: 'k',
          duration: 1080,
        }),
      },
      {
        id: 'positive',
        label: 'Positive paths',
        value: `${positivePaths}%`,
        tone: 'mint',
        motion: buildMetricMotion(positivePaths, { suffix: '%', duration: 1040 }),
      },
    ],
    scenario: scenarioProfile,
    band: bandProfile,
  };
}

function buildHeatmapDetails(cell, benchmarkId) {
  if (!cell) return null;

  const benchmarkReturns =
    PORTAL_YEAR_BENCHMARK_RETURNS[cell.year] ?? PORTAL_YEAR_BENCHMARK_RETURNS['2026 YTD'];
  const benchmarkMonthly = Number((benchmarkReturns[benchmarkId] / 12).toFixed(1));
  const spread = Number((cell.value - benchmarkMonthly).toFixed(1));

  return {
    title: `${cell.month} ${cell.year}`,
    summary: `${cell.value >= 0 ? '+' : ''}${cell.value.toFixed(1)}% · ${getHeatmapRegime(cell.value)}`,
    stats: [
      { label: 'Return', value: `${cell.value >= 0 ? '+' : ''}${cell.value.toFixed(1)}%` },
      { label: 'Rolling vol', value: `${getHeatmapVolatility(cell.value)}%` },
      { label: 'Spread vs benchmark', value: `${spread >= 0 ? '+' : ''}${spread.toFixed(1)} pts` },
    ],
    bullets: [
      `This month is tagged as ${getHeatmapRegime(cell.value).toLowerCase()}.`,
      `Preview bars above are synced to ${cell.year} while you inspect this row.`,
      `${getOption(PORTAL_BENCHMARK_OPTIONS, benchmarkId).label} is the active baseline for the spread read.`,
    ],
  };
}

function PortalControlBar({
  controls,
  onWindowChange,
  onBenchmarkChange,
  onModeChange,
  onClearYearFocus,
}) {
  const { ref, isVisible } = useViewportReveal({ threshold: 0.12 });

  return (
    <section
      ref={ref}
      className={`spread portal-control-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="portal-controls"
    >
      <div className="campaign-grid portal-control-grid">
        <div className="portal-control-shell">
          <div className="portal-control-group">
            <span className="portal-control-label">Window</span>
            <div className="portal-control-pills" role="group" aria-label="Time window">
              {PORTAL_TIME_WINDOWS.map((item) => (
                <button
                  aria-pressed={controls.windowId === item.id}
                  className={`portal-control-pill${controls.windowId === item.id ? ' is-active' : ''}`}
                  key={item.id}
                  onClick={() => onWindowChange(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="portal-control-group">
            <span className="portal-control-label">Benchmark</span>
            <div className="portal-control-pills" role="group" aria-label="Benchmark selection">
              {PORTAL_BENCHMARK_OPTIONS.map((item) => (
                <button
                  aria-pressed={controls.benchmarkId === item.id}
                  className={`portal-control-pill${controls.benchmarkId === item.id ? ' is-active' : ''}`}
                  key={item.id}
                  onClick={() => onBenchmarkChange(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="portal-control-group">
            <span className="portal-control-label">Mode</span>
            <div className="portal-control-pills" role="group" aria-label="Mode selection">
              {PORTAL_MODE_OPTIONS.map((item) => (
                <button
                  aria-pressed={controls.modeId === item.id}
                  className={`portal-control-pill${controls.modeId === item.id ? ' is-active' : ''}`}
                  key={item.id}
                  onClick={() => onModeChange(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {controls.selectedYear ? (
            <div className="portal-control-focus">
              <span className="portal-control-focus-label">Year focus</span>
              <button
                className="portal-control-focus-pill"
                onClick={onClearYearFocus}
                type="button"
              >
                {controls.selectedYear}
                <span>Clear</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PortalHero({ reduceMotion = false }) {
  const { ref, isVisible } = useViewportReveal({ threshold: 0.14 });
  const heroPrinciples = ['Replayable', 'Benchmark-aware', 'Promotion-gated'];

  return (
    <section
      ref={ref}
      className={`spread portal-hero-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="portal-top"
    >
      <div className="portal-hero-atmosphere" aria-hidden="true">
        <span className="portal-hero-block portal-hero-block-pink" />
        <span className="portal-hero-block portal-hero-block-blue" />
        <span className="portal-hero-block portal-hero-block-mint" />
        <span className="portal-hero-block portal-hero-block-ink" />
      </div>

      <div className="campaign-grid portal-hero-grid">
        <div className="portal-hero-copy">
          <p className="section-kicker">Data Portal</p>
          <h1>
            <span>Where research</span>
            <span>becomes evidence.</span>
          </h1>
          <p className="micro-intro">
            Data Portal is the operating layer behind the product: a single place to inspect what
            came in, what got replayed, what passed the gate, and what shipped with receipts.
          </p>

          <div className="portal-hero-principles" aria-label="Data portal principles">
            {heroPrinciples.map((item) => (
              <span className="portal-hero-principle" key={item}>
                {item}
              </span>
            ))}
          </div>

          <div className="portal-hero-stats" aria-label="Data portal summary metrics">
            {portalHeroStats.map((item) => (
              <article className="portal-mini-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>
                  <AnimatedMetricValue
                    disabled={reduceMotion}
                    isActive={isVisible}
                    motion={item.motion}
                    value={item.value}
                  />
                </strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalBacktestSection({
  reduceMotion = false,
  model,
  activeCard,
  activeMonthIndex,
  onActivateCard,
  onOpenDrawer,
}) {
  const { ref, isVisible } = useViewportReveal();
  const isCardActive = activeCard === 'backtest';

  return (
    <section
      ref={ref}
      className={`spread portal-backtest-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="backtest"
    >
      <div className="campaign-grid portal-backtest-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Backtest</p>
          <h2>Replay before release.</h2>
          <p className="micro-intro">
            Use the same controls as the rest of the page. Replay, benchmark context, and evidence
            should move together instead of living in separate screenshots.
          </p>
        </div>

        <div className="portal-backtest-stage">
          <article
            className={`portal-backtest-shell${isCardActive ? ' is-card-active' : ''}`}
            onClick={() => onActivateCard('backtest')}
          >
            <div className="portal-backtest-head">
              <span className="portal-shell-kicker">{model.kicker}</span>

              <div className="portal-card-head-actions">
                <span className="portal-shell-pill">{model.pill}</span>
                <button
                  className="portal-card-trigger"
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivateCard('backtest');
                    onOpenDrawer({ type: 'backtest' });
                  }}
                  type="button"
                >
                  Evidence
                </button>
              </div>
            </div>

            <div className="portal-backtest-chart">
              {model.bars.map((value, index) => (
                <span
                  className={`portal-backtest-bar${activeMonthIndex === index ? ' is-active' : ''}`}
                  key={`backtest-${value}-${index}`}
                  style={{
                    '--portal-line-height': `${Math.max(18, value)}%`,
                    '--portal-bar-order': index,
                  }}
                />
              ))}
            </div>

            <div className="portal-backtest-axis">
              {model.axisLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="portal-backtest-notes">
              {model.notes.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="portal-card-secondary">
              <div className="portal-card-secondary-copy">
                <strong>{model.secondaryTitle}</strong>
                <p>{model.secondaryBody}</p>
              </div>

              <button
                className="portal-card-secondary-link"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDrawer({ type: 'backtest' });
                }}
                type="button"
              >
                Open evidence
              </button>
            </div>
          </article>

          <div className="portal-backtest-metric-grid">
            {model.metrics.map((item) => (
              <article
                className={`portal-metric-card portal-metric-card-${item.tone}`}
                key={item.label}
              >
                <span>{item.label}</span>
                <strong>
                  <AnimatedMetricValue
                    disabled={reduceMotion}
                    isActive={isVisible}
                    motion={item.motion}
                    value={item.value}
                  />
                </strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalAnalyticsSection({
  reduceMotion = false,
  benchmarkId,
  benchmarkModel,
  controls,
  hoveredBenchmark,
  hoveredCell,
  hoveredPath,
  activeCard,
  selectedYear,
  selectedCell,
  selectedPath,
  heatmapDetail,
  monteCarloModel,
  onActivateCard,
  onBenchmarkEnter,
  onBenchmarkLeave,
  onBenchmarkSelect,
  onHeatmapEnter,
  onHeatmapLeave,
  onHeatmapSelect,
  onOpenDrawer,
  onPathEnter,
  onPathLeave,
  onPathSelect,
  onScenarioChange,
  onBandChange,
}) {
  const { ref, isVisible } = useViewportReveal();
  const focusedCell = hoveredCell ?? selectedCell;
  const focusedPath = hoveredPath ?? selectedPath;
  const isHeatmapActive = activeCard === 'heatmap' || Boolean(selectedYear) || Boolean(focusedCell);
  const isMonteActive = activeCard === 'monte' || Boolean(focusedPath);
  const isBenchmarkActive = activeCard === 'benchmark' || Boolean(hoveredBenchmark);

  return (
    <section
      ref={ref}
      className={`spread portal-analytics-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="analytics"
    >
      <div className="campaign-grid portal-analytics-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Analytics</p>
          <h2>Read the edge.</h2>
          <p className="micro-intro">
            Every chart now responds to the same lens. Window, benchmark, mode, scenario, and year
            focus are all linked instead of being decorative.
          </p>
        </div>

        <div className="portal-analytics-stage">
          <article
            className={`portal-analytics-card portal-heatmap-card${isHeatmapActive ? ' is-card-active' : ''}`}
            onClick={() => onActivateCard('heatmap')}
          >
            <div className="portal-card-head">
              <span className="portal-shell-kicker">HEATMAP</span>

              <div className="portal-card-head-actions">
                <span className="portal-shell-pill">MONTHLY</span>
                <button
                  className="portal-card-trigger"
                  disabled={!focusedCell}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!focusedCell) return;
                    onActivateCard('heatmap');
                    onOpenDrawer({ type: 'heatmap', cell: focusedCell });
                  }}
                  type="button"
                >
                  Evidence
                </button>
              </div>
            </div>

            <div className="portal-heatmap-scroll">
              <div
                className="portal-heatmap-shell"
                role="table"
                aria-label="Monthly return heatmap"
              >
                <div className="portal-heatmap-row portal-heatmap-row-head" role="row">
                  <span className="portal-heatmap-year" role="columnheader">
                    Year
                  </span>
                  {portalHeatmapMonths.map((month) => (
                    <span className="portal-heatmap-month" key={month} role="columnheader">
                      {month}
                    </span>
                  ))}
                </div>

                {portalMonthlyHeatmap.map((row, rowIndex) => (
                  <div
                    className={`portal-heatmap-row${selectedYear === row.year ? ' is-active' : ''}`}
                    key={row.year}
                    role="row"
                  >
                    <button
                      className="portal-heatmap-year portal-heatmap-year-button"
                      onClick={() =>
                        onHeatmapSelect({
                          year: row.year,
                          month: null,
                          monthIndex: null,
                          value: null,
                        })
                      }
                      type="button"
                    >
                      {row.year}
                    </button>

                    {row.values.map((value, index) => {
                      const cellIsActive =
                        focusedCell?.year === row.year && focusedCell?.monthIndex === index;
                      const cellIsLinked =
                        selectedYear === row.year && focusedCell?.monthIndex === index;

                      return (
                        <button
                          className={`portal-heatmap-cell portal-heatmap-cell-${getHeatmapTone(value)}${cellIsActive ? ' is-active' : ''}${cellIsLinked ? ' is-linked' : ''}`}
                          key={`${row.year}-${portalHeatmapMonths[index]}`}
                          onClick={() =>
                            onHeatmapSelect({
                              year: row.year,
                              month: portalHeatmapMonths[index],
                              monthIndex: index,
                              value,
                            })
                          }
                          onMouseEnter={(event) =>
                            onHeatmapEnter(event, {
                              year: row.year,
                              month: portalHeatmapMonths[index],
                              monthIndex: index,
                              value,
                            })
                          }
                          onMouseLeave={onHeatmapLeave}
                          role="cell"
                          style={{ '--portal-cell-order': rowIndex * 12 + index }}
                          type="button"
                        >
                          {value == null ? '' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`portal-heatmap-tooltip${hoveredCell ? ' is-visible' : ''}`}
              style={hoveredCell ? { left: hoveredCell.left, top: hoveredCell.top } : undefined}
            >
              {hoveredCell ? (
                <>
                  <strong>{`${hoveredCell.month} ${hoveredCell.year}`}</strong>
                  <span>{`${hoveredCell.value >= 0 ? '+' : ''}${hoveredCell.value.toFixed(1)}% · ${getHeatmapRegime(hoveredCell.value)}`}</span>
                </>
              ) : null}
            </div>

            <div className="portal-heatmap-legend" aria-hidden="true">
              <span>Weak</span>
              <span className="portal-heatmap-swatch portal-heatmap-swatch-negative" />
              <span className="portal-heatmap-swatch portal-heatmap-swatch-neutral" />
              <span className="portal-heatmap-swatch portal-heatmap-swatch-positive" />
              <span>Strong</span>
            </div>

            <div className="portal-card-secondary">
              <div className="portal-card-secondary-copy">
                <strong>{heatmapDetail?.title ?? 'Tap a year or month to focus replay.'}</strong>
                <p>
                  {heatmapDetail?.summary ??
                    'Hover previews a year in the replay chart. Tapping locks the year and opens the evidence drawer.'}
                </p>
              </div>

              <div className="portal-card-secondary-tags">
                <span>{controls.windowLabel}</span>
                <span>{getOption(PORTAL_BENCHMARK_OPTIONS, benchmarkId).label}</span>
                {selectedYear ? <span>{selectedYear}</span> : null}
              </div>
            </div>
          </article>

          <article
            className={`portal-analytics-card portal-monte-carlo-card${isMonteActive ? ' is-card-active' : ''}`}
            onClick={() => onActivateCard('monte')}
          >
            <div className="portal-card-head">
              <span className="portal-shell-kicker">MONTE CARLO</span>

              <div className="portal-card-head-actions">
                <span className="portal-shell-pill">{controls.scenarioLabel}</span>
                <button
                  className="portal-card-trigger"
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivateCard('monte');
                    onOpenDrawer({ type: 'monte' });
                  }}
                  type="button"
                >
                  Evidence
                </button>
              </div>
            </div>

            <div className="portal-card-secondary portal-card-secondary-inline">
              <div className="portal-inline-controls">
                <div className="portal-inline-group">
                  <span>Scenario</span>
                  <div className="portal-inline-pills">
                    {PORTAL_SCENARIO_OPTIONS.map((item) => (
                      <button
                        className={`portal-inline-pill${controls.scenarioId === item.id ? ' is-active' : ''}`}
                        key={item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onScenarioChange(item.id);
                          onActivateCard('monte');
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="portal-inline-group">
                  <span>Band</span>
                  <div className="portal-inline-pills">
                    {PORTAL_BAND_OPTIONS.map((item) => (
                      <button
                        className={`portal-inline-pill${controls.bandId === item.id ? ' is-active' : ''}`}
                        key={item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          onBandChange(item.id);
                          onActivateCard('monte');
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="portal-card-secondary-copy">
                <strong>{monteCarloModel.secondaryTitle}</strong>
                <p>{monteCarloModel.secondaryBody}</p>
              </div>
            </div>

            <div className="portal-monte-carlo-chart">
              <svg
                aria-label="Monte Carlo simulation path fan"
                className="portal-monte-carlo-svg"
                role="img"
                viewBox={`0 0 ${PORTAL_MONTE_CARLO_WIDTH} ${PORTAL_MONTE_CARLO_HEIGHT}`}
              >
                <path
                  className="portal-monte-carlo-baseline"
                  d={`M0 ${PORTAL_MONTE_CARLO_HEIGHT - 1} H${PORTAL_MONTE_CARLO_WIDTH}`}
                />

                {monteCarloModel.paths.map((path, index) => {
                  const isVisiblePath = monteCarloModel.visibleLabels.has(path.label);
                  const isFocusedPath = focusedPath === path.label;

                  return (
                    <polyline
                      className={`portal-monte-carlo-path portal-monte-carlo-path-${path.tone}${!isVisiblePath ? ' is-hidden' : ''}${isFocusedPath ? ' is-active' : ''}${focusedPath && !isFocusedPath ? ' is-dimmed' : ''}`}
                      fill="none"
                      key={path.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPathSelect(path.label);
                      }}
                      onMouseEnter={() => onPathEnter(path.label)}
                      onMouseLeave={onPathLeave}
                      pathLength="100"
                      points={buildMonteCarloPath(path.values, monteCarloModel.range)}
                      style={{ '--portal-path-order': index }}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="portal-monte-carlo-axis" aria-hidden="true">
              <span>Start</span>
              <span>3M</span>
              <span>6M</span>
              <span>9M</span>
              <span>12M</span>
            </div>

            <div className="portal-monte-carlo-stat-grid">
              {monteCarloModel.stats.map((item) => {
                const isStatActive = focusedPath
                  ? PORTAL_PATH_TO_STAT[focusedPath] === item.id
                  : false;

                return (
                  <article
                    className={`portal-monte-carlo-stat portal-monte-carlo-stat-${item.tone}${isStatActive ? ' is-active' : ''}${focusedPath && !isStatActive ? ' is-dimmed' : ''}`}
                    key={item.label}
                  >
                    <span>{item.label}</span>
                    <strong>
                      {item.rangeMotion ? (
                        <AnimatedMetricRange
                          disabled={reduceMotion}
                          isActive={isVisible}
                          rangeMotion={item.rangeMotion}
                          value={item.value}
                        />
                      ) : (
                        <AnimatedMetricValue
                          disabled={reduceMotion}
                          isActive={isVisible}
                          motion={item.motion}
                          value={item.value}
                        />
                      )}
                    </strong>
                  </article>
                );
              })}
            </div>
          </article>

          <article
            className={`portal-analytics-card portal-benchmark-card${isBenchmarkActive ? ' is-card-active' : ''}`}
            onClick={() => onActivateCard('benchmark')}
          >
            <div className="portal-card-head">
              <span className="portal-shell-kicker">VS BENCHMARKS</span>

              <div className="portal-card-head-actions">
                <span className="portal-shell-pill">{benchmarkModel.activeBenchmark.label}</span>
                <button
                  className="portal-card-trigger"
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivateCard('benchmark');
                    onOpenDrawer({ type: 'benchmark' });
                  }}
                  type="button"
                >
                  Evidence
                </button>
              </div>
            </div>

            <div className="portal-benchmark-bars" aria-label="Strategy benchmark comparison">
              {benchmarkModel.rows.map((item, index) => {
                const isHoveredBar = hoveredBenchmark === item.id;
                const isSelectedBar = item.id === benchmarkId;

                return (
                  <article
                    className={`portal-benchmark-bar${isHoveredBar || isSelectedBar ? ' is-active' : ''}${hoveredBenchmark && !isHoveredBar ? ' is-dimmed' : ''}`}
                    key={item.label}
                    onClick={(event) => {
                      event.stopPropagation();
                      onBenchmarkSelect(item.id);
                      onOpenDrawer({ type: 'benchmark', itemId: item.id });
                    }}
                    onMouseEnter={() => onBenchmarkEnter(item.id)}
                    onMouseLeave={onBenchmarkLeave}
                  >
                    <div className="portal-benchmark-track">
                      <span
                        className={`portal-benchmark-fill portal-benchmark-fill-${item.tone}`}
                        style={{
                          '--portal-benchmark-height': `${item.height}%`,
                          '--portal-bar-order': index,
                        }}
                      />
                    </div>

                    <div className="portal-benchmark-copy">
                      <strong>
                        <AnimatedMetricValue
                          disabled={reduceMotion}
                          isActive={isVisible}
                          motion={item.motion}
                          value={item.valueLabel}
                        />
                      </strong>
                      <h3>{item.label}</h3>
                      <p>{item.note}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="portal-benchmark-footer">
              <span>{`Alpha vs ${benchmarkModel.activeBenchmark.label}`}</span>
              <strong>
                <AnimatedMetricValue
                  disabled={reduceMotion}
                  isActive={isVisible}
                  motion={benchmarkModel.alphaMotion}
                  value={`${benchmarkModel.alpha >= 0 ? '+' : ''}${benchmarkModel.alpha} pts`}
                />
              </strong>
            </div>

            <div className="portal-card-secondary">
              <div className="portal-card-secondary-copy">
                <strong>{benchmarkModel.secondaryTitle}</strong>
                <p>{benchmarkModel.secondaryBody}</p>
              </div>

              <div className="portal-card-secondary-tags">
                {benchmarkModel.chips.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function PortalFlywheelSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread portal-flywheel-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="flywheel"
    >
      <div className="campaign-grid portal-flywheel-grid">
        <div className="portal-section-copy">
          <p className="section-kicker">Flywheel</p>
          <h2>The loop compounds.</h2>
          <p className="micro-intro">
            Data Portal makes the cycle inspectable: what came in, what was generated, what got
            replayed, what shipped, and what came back as evidence.
          </p>
        </div>

        <div className="portal-flywheel-stage" aria-label="Decision flywheel">
          <div className="portal-flywheel-ring" aria-hidden="true" />

          <article className="portal-flywheel-core">
            <span className="portal-shell-kicker">DECISION FLYWHEEL</span>
            <strong>Research → risk → execution → evidence.</strong>
            <p>Every edge needs both imagination and memory.</p>
          </article>

          {portalFlywheelSteps.map((step, index) => (
            <article
              className={`portal-flywheel-node portal-flywheel-node-${step.tone} portal-flywheel-node-${step.slot}`}
              key={step.title}
              style={{ '--portal-step-delay': `${index * 70}ms` }}
            >
              <span className="portal-flywheel-order">{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PortalFabricSection() {
  const { ref, isVisible } = useViewportReveal();

  return (
    <section
      ref={ref}
      className={`spread portal-fabric-spread${isVisible ? ' is-motion-visible' : ''}`}
      id="fabric"
    >
      <div className="portal-fabric-shell">
        <div className="campaign-grid portal-fabric-grid">
          <div className="portal-fabric-copy">
            <p className="section-kicker-light">Data Fabric</p>
            <h2>One surface. Full memory.</h2>
            <p className="micro-intro-light">
              This is where the work becomes inspectable: ingest, experiments, replay, audit, and
              promotion gates all tied to the same decision timeline.
            </p>
          </div>

          <div className="portal-fabric-lanes">
            {portalFabricLanes.map((lane, index) => (
              <article
                className={`portal-fabric-lane portal-fabric-lane-${lane.tone}`}
                key={lane.title}
                style={{ '--portal-lane-delay': `${index * 80}ms` }}
              >
                <span className="portal-shell-kicker">
                  LAYER {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{lane.title}</h3>
                <div className="portal-fabric-items">
                  {lane.items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="portal-fabric-footer">
            <p>
              The point is not just to generate more strategy ideas. It is to keep a clean memory of
              what was tested, why it passed, and when it should be retired.
            </p>

            <div className="portal-fabric-actions">
              <a className="portal-dark-cta" href="https://app.novaquant.cloud">
                Get Started
              </a>
              <a className="portal-ghost-link" href="/">
                Back to Main Page
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalEvidenceDrawer({ drawer, onClose }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (drawer && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [drawer]);

  useEffect(() => {
    if (!drawer) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawer, onClose]);

  if (!drawer) return null;

  return (
    <>
      <button
        aria-label="Close evidence drawer"
        className="portal-evidence-backdrop"
        onClick={onClose}
        type="button"
      />

      <aside
        className="portal-evidence-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence details"
        tabIndex={-1}
      >
        <div className="portal-evidence-shell">
          <div className="portal-evidence-head">
            <div>
              <span className="portal-shell-kicker">{drawer.kicker}</span>
              <h3>{drawer.title}</h3>
            </div>

            <button className="portal-evidence-close" onClick={onClose} type="button">
              Close
            </button>
          </div>

          <p className="portal-evidence-summary">{drawer.summary}</p>

          <div className="portal-evidence-metric-grid">
            {drawer.stats.map((item) => (
              <article className="portal-evidence-metric" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="portal-evidence-bullets">
            {drawer.bullets.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>

          <div className="portal-evidence-tags">
            {drawer.tags.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function DataPortalPage() {
  const reduceMotion = useMotionPreference('(prefers-reduced-motion: reduce)');
  const [windowId, setWindowId] = useState('si');
  const [benchmarkId, setBenchmarkId] = useState('sp500');
  const [modeId, setModeId] = useState('live');
  const [scenarioId, setScenarioId] = useState('base');
  const [bandId, setBandId] = useState('75');
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [hoveredBenchmark, setHoveredBenchmark] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [hoveredPath, setHoveredPath] = useState(null);
  const [activeCard, setActiveCard] = useState(null);
  const [drawerState, setDrawerState] = useState(null);

  const windowProfile = getOption(PORTAL_TIME_WINDOWS, windowId);
  const modeProfile = getOption(PORTAL_MODE_OPTIONS, modeId);
  const scenarioProfile = getOption(PORTAL_SCENARIO_OPTIONS, scenarioId);
  const benchmarkOption = getOption(PORTAL_BENCHMARK_OPTIONS, benchmarkId);
  const previewYearKey =
    selectedYear ?? selectedCell?.year ?? hoveredCell?.year ?? windowProfile.defaultYear;
  const previewYear = portalMonthlyHeatmap.find((item) => item.year === previewYearKey) ?? null;
  const focusCell = hoveredCell ?? selectedCell;
  const focusPath = hoveredPath ?? selectedPath;
  const activeMonthIndex =
    focusCell && previewYear && focusCell.year === previewYear.year ? focusCell.monthIndex : null;

  const backtestModel = buildBacktestModel(windowProfile, modeProfile, previewYear);
  const benchmarkModel = buildBenchmarkModel(
    windowProfile,
    benchmarkId,
    modeProfile,
    selectedYear ? (portalMonthlyHeatmap.find((item) => item.year === selectedYear) ?? null) : null,
  );
  const monteCarloModel = buildMonteCarloModel(windowProfile, modeProfile, scenarioId, bandId);
  const heatmapDetail = buildHeatmapDetails(focusCell, benchmarkId);

  useEffect(() => {
    const visiblePaths = getOption(PORTAL_BAND_OPTIONS, bandId).visible;
    if (selectedPath && !visiblePaths.includes(selectedPath)) {
      setSelectedPath(null);
    }
  }, [bandId, selectedPath]);

  const drawer = (() => {
    if (!drawerState) return null;

    if (drawerState.type === 'backtest') {
      const primaryMetrics = backtestModel.metrics.map((item) => ({
        label: item.label,
        value: item.value,
      }));

      return {
        kicker: 'REPLAY DETAIL',
        title: backtestModel.title,
        summary: `${windowProfile.label} · ${modeProfile.label} · replay and evidence stay linked.`,
        stats: primaryMetrics,
        bullets: [
          backtestModel.secondaryBody,
          activeMonthIndex != null
            ? `The replay chart is currently linked to ${portalHeatmapMonths[activeMonthIndex]}.`
            : 'Hovering the heatmap previews a month on the replay chart.',
          modeProfile.note,
        ],
        tags: [windowProfile.label, modeProfile.label, previewYear?.year ?? 'All windows'],
      };
    }

    if (drawerState.type === 'heatmap') {
      const detail = buildHeatmapDetails(drawerState.cell ?? hoveredCell, benchmarkId);
      if (!detail) return null;

      return {
        kicker: 'HEATMAP DETAIL',
        title: detail.title,
        summary: detail.summary,
        stats: detail.stats,
        bullets: detail.bullets,
        tags: [windowProfile.label, benchmarkOption.label, modeProfile.label],
      };
    }

    if (drawerState.type === 'monte') {
      return {
        kicker: 'SCENARIO DETAIL',
        title: `${scenarioProfile.label} / ${getOption(PORTAL_BAND_OPTIONS, bandId).label}`,
        summary: monteCarloModel.secondaryBody,
        stats: monteCarloModel.stats.map((item) => ({
          label: item.label,
          value: item.value,
        })),
        bullets: [
          `${scenarioProfile.note}`,
          focusPath
            ? `${focusPath} is currently highlighted and linked to the matching summary stat.`
            : 'Hover a path to light up the matching stat card.',
          `${windowProfile.label} and ${modeProfile.label.toLowerCase()} are both feeding this distribution.`,
        ],
        tags: [
          windowProfile.label,
          modeProfile.label,
          scenarioProfile.label,
          getOption(PORTAL_BAND_OPTIONS, bandId).label,
        ],
      };
    }

    if (drawerState.type === 'benchmark') {
      const selectedRow =
        benchmarkModel.rows.find((item) => item.id === (drawerState.itemId ?? benchmarkId)) ??
        benchmarkModel.rows[1];

      return {
        kicker: 'BENCHMARK DETAIL',
        title: `Strategy vs ${selectedRow.label}`,
        summary: `Alpha is ${benchmarkModel.alpha >= 0 ? '+' : ''}${benchmarkModel.alpha} pts for the same lens.`,
        stats: [
          { label: 'Strategy return', value: benchmarkModel.rows[0].valueLabel },
          { label: selectedRow.label, value: selectedRow.valueLabel },
          { label: 'Capture ratio', value: `${benchmarkModel.capture}%` },
          { label: 'Estimated beta', value: benchmarkModel.beta.toFixed(2) },
        ],
        bullets: [
          PORTAL_BENCHMARK_NOTES[selectedRow.id] ?? 'Selected comparison baseline.',
          `Current benchmark control is ${benchmarkOption.label}.`,
          `Switching the benchmark updates alpha, card emphasis, and the drawer context together.`,
        ],
        tags: benchmarkModel.chips,
      };
    }

    return null;
  })();

  return (
    <>
      <PortalHero reduceMotion={reduceMotion} />
      <PortalControlBar
        controls={{
          windowId,
          benchmarkId,
          modeId,
          selectedYear,
        }}
        onBenchmarkChange={setBenchmarkId}
        onClearYearFocus={() => {
          setSelectedYear(null);
          setSelectedCell(null);
          setHoveredCell(null);
        }}
        onModeChange={setModeId}
        onWindowChange={setWindowId}
      />
      <PortalBacktestSection
        activeCard={activeCard}
        activeMonthIndex={activeMonthIndex}
        model={backtestModel}
        onActivateCard={setActiveCard}
        onOpenDrawer={setDrawerState}
        reduceMotion={reduceMotion}
      />
      <PortalAnalyticsSection
        activeCard={activeCard}
        benchmarkId={benchmarkId}
        benchmarkModel={benchmarkModel}
        controls={{
          scenarioId,
          scenarioLabel: scenarioProfile.label,
          bandId,
          windowLabel: windowProfile.label,
        }}
        heatmapDetail={heatmapDetail}
        hoveredBenchmark={hoveredBenchmark}
        hoveredCell={hoveredCell}
        hoveredPath={hoveredPath}
        monteCarloModel={monteCarloModel}
        onActivateCard={setActiveCard}
        onBandChange={setBandId}
        onBenchmarkEnter={setHoveredBenchmark}
        onBenchmarkLeave={() => setHoveredBenchmark(null)}
        onBenchmarkSelect={(id) => {
          setActiveCard('benchmark');
          setHoveredBenchmark(id === 'strategy' ? null : id);
          if (id !== 'strategy') {
            setBenchmarkId(id);
          }
        }}
        onHeatmapEnter={(event, nextCell) => {
          if (nextCell.value == null) return;
          const cardRect = event.currentTarget
            .closest('.portal-heatmap-card')
            ?.getBoundingClientRect();
          const cellRect = event.currentTarget.getBoundingClientRect();

          setHoveredCell({
            ...nextCell,
            left: cardRect ? cellRect.left - cardRect.left + cellRect.width / 2 : 0,
            top: cardRect ? cellRect.top - cardRect.top - 14 : 0,
          });
        }}
        onHeatmapLeave={() => setHoveredCell(null)}
        onHeatmapSelect={(payload) => {
          if (payload.value == null) {
            setSelectedYear((current) => (current === payload.year ? null : payload.year));
            setSelectedCell(null);
            setActiveCard('heatmap');
            setDrawerState(null);
            return;
          }

          setSelectedYear(payload.year);
          setSelectedCell(payload);
          setHoveredCell(null);
          setActiveCard('heatmap');
          setDrawerState({
            type: 'heatmap',
            cell: payload,
          });
        }}
        onOpenDrawer={setDrawerState}
        onPathEnter={setHoveredPath}
        onPathLeave={() => setHoveredPath(null)}
        onPathSelect={(label) => {
          setSelectedPath(label);
          setActiveCard('monte');
          setDrawerState({ type: 'monte', label });
        }}
        onScenarioChange={setScenarioId}
        reduceMotion={reduceMotion}
        selectedYear={selectedYear}
        selectedCell={selectedCell}
        selectedPath={selectedPath}
      />
      <PortalFlywheelSection />
      <PortalFabricSection />
      <PortalEvidenceDrawer drawer={drawer} onClose={() => setDrawerState(null)} />
    </>
  );
}

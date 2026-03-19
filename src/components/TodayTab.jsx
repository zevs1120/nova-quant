import { useMemo, useState } from 'react';
import SignalDetail from './SignalDetail';
import {
  getActionCardCopy,
  getNoActionCopy,
} from '../copy/novaCopySystem.js';
import { describeEvidenceMode } from '../utils/provenance';

const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);
const DATA_STATUS_PENALTY = {
  DB_BACKED: 0,
  MODEL_DERIVED: 6,
  PAPER_ONLY: 14,
  BACKTEST_ONLY: 18,
  DEMO_ONLY: 24,
  EXPERIMENTAL: 22,
  WITHHELD: 36,
  INSUFFICIENT_DATA: 48
};

function normalizeDataStatus(signal) {
  const value = String(
    signal?.data_status ||
      signal?.source_label ||
      signal?.source_status ||
      signal?.source_transparency?.data_status ||
      signal?.source_transparency?.source_label ||
      signal?.source_transparency?.source_status ||
      'INSUFFICIENT_DATA'
  )
    .trim()
    .toUpperCase();
  return value || 'INSUFFICIENT_DATA';
}

function timestampMs(input) {
  const value = Date.parse(String(input || ''));
  return Number.isFinite(value) ? value : null;
}

function freshnessLabel(signal, now) {
  const createdAtMs = timestampMs(signal?.created_at || signal?.generated_at);
  if (!createdAtMs) return '--';
  const diffMs = Math.max(0, now.getTime() - createdAtMs);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function signalDirection(signal) {
  const direction = String(signal?.direction || '').toUpperCase();
  if (direction === 'LONG') return 'Long';
  if (direction === 'SHORT') return 'Short';
  return 'Wait';
}

function isActionable(signal) {
  const status = String(signal?.status || '').toUpperCase();
  const dataStatus = normalizeDataStatus(signal);
  if (!ACTIVE_SIGNAL_STATUS.has(status)) return false;
  if (dataStatus === 'WITHHELD' || dataStatus === 'INSUFFICIENT_DATA') return false;
  return true;
}

function mergeEvidenceSignals(allSignals, evidenceSignals) {
  if (!Array.isArray(evidenceSignals) || !evidenceSignals.length) return allSignals || [];
  const signalById = new Map((allSignals || []).map((row) => [row.signal_id, row]));
  return evidenceSignals.map((row) => {
    const base = signalById.get(row.signal_id) || {};
    const evidenceDataStatus = String(
      row?.source_transparency?.data_status ||
        row?.source_transparency?.source_label ||
        row?.evidence_status ||
        'INSUFFICIENT_DATA'
    ).toUpperCase();
    return {
      ...base,
      signal_id: row.signal_id || base.signal_id,
      symbol: row.symbol || base.symbol,
      market: row.market || base.market,
      asset_class: row.asset_class || base.asset_class,
      direction: row.direction || base.direction,
      confidence: Number.isFinite(Number(row.conviction)) ? Number(row.conviction) : base.confidence,
      created_at: base.created_at || row.created_at || row.generated_at || null,
      entry_zone: row.entry_zone || base.entry_zone || null,
      stop_loss:
        base.stop_loss ||
        (Number.isFinite(Number(row.invalidation))
          ? {
              type: 'EVIDENCE',
              price: Number(row.invalidation),
              rationale: 'Evidence-derived invalidation'
            }
          : null),
      invalidation_level:
        Number.isFinite(Number(base.invalidation_level)) ? base.invalidation_level : Number(row.invalidation),
      take_profit_levels: base.take_profit_levels || [],
      position_advice: base.position_advice || null,
      explain_bullets: base.explain_bullets || (row.thesis ? [row.thesis] : []),
      status: base.status || (row.actionable ? 'NEW' : 'WITHHELD'),
      score: Number.isFinite(Number(base.score)) ? Number(base.score) : Number(row.conviction || 0) * 100,
      source_transparency: row.source_transparency || base.source_transparency || null,
      source_status: row.source_transparency?.source_status || base.source_status || 'INSUFFICIENT_DATA',
      source_label: row.source_transparency?.source_label || base.source_label || evidenceDataStatus,
      data_status: base.data_status || evidenceDataStatus,
      freshness_label: row.freshness_label || null,
      actionable: Boolean(row.actionable),
      supporting_run_id: row.supporting_run_id || null
    };
  });
}

function rankSignal(signal, now) {
  const confidence = Number(signal?.confidence || 0);
  const score = Number(signal?.score || 0);
  const dataStatus = normalizeDataStatus(signal);
  const createdAtMs = timestampMs(signal?.created_at || signal?.generated_at);
  const ageHours = createdAtMs ? (now.getTime() - createdAtMs) / 3600000 : 72;
  const freshnessPenalty = Math.min(28, Math.max(0, ageHours * 1.1));
  const actionableBonus = isActionable(signal) ? 18 : -14;
  const dataPenalty = DATA_STATUS_PENALTY[dataStatus] ?? 30;
  return score + confidence * 100 * 0.25 + actionableBonus - freshnessPenalty - dataPenalty;
}

function pickBestSignal(signals, evidenceSignals, assetClass, now) {
  const merged = mergeEvidenceSignals(signals, evidenceSignals);
  const list = (merged || [])
    .filter((item) => {
      const signalAsset = item.asset_class || (item.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
      return signalAsset === assetClass;
    })
    .map((item) => ({
      ...item,
      _rank: rankSignal(item, now),
      _dataStatus: normalizeDataStatus(item),
      _actionable: isActionable(item),
      _freshness: item?.freshness_label || freshnessLabel(item, now)
    }))
    .sort((a, b) => b._rank - a._rank);
  return list[0] || null;
}

function recentSignals(signals, evidenceSignals, assetClass, now, bestSignal) {
  const merged = mergeEvidenceSignals(signals, evidenceSignals);
  return (merged || [])
    .filter((item) => {
      const signalAsset = item.asset_class || (item.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
      return signalAsset === assetClass && item.signal_id !== bestSignal?.signal_id;
    })
    .map((item) => ({
      ...item,
      _rank: rankSignal(item, now),
      _dataStatus: normalizeDataStatus(item),
      _freshness: item?.freshness_label || freshnessLabel(item, now)
    }))
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 3);
}

function suggestionSubtitle(bestSignal, locale) {
  if (!bestSignal) {
    return locale === 'zh' ? '暂时没有足够干净的动作，先等更清楚的条件。' : 'No clean setup yet. Better conditions are worth waiting for.';
  }
  if (!bestSignal._actionable) {
    return locale === 'zh' ? '信号存在，但还不值得执行。' : 'There is a signal, but not an executable one yet.';
  }
  if (bestSignal.direction === 'SHORT') {
    return locale === 'zh' ? '风险仍偏高，只允许小而严格的动作。' : 'Risk is still elevated. Keep size small and execution strict.';
  }
  return locale === 'zh' ? '今天可以看动作，但仓位仍然要轻。' : 'Selective action is workable today. Size still stays light.';
}

function deriveOverallStatus(args) {
  const { today, safety, runtime, bestSignal, locale } = args;
  const mode = String(safety?.mode || '').toLowerCase();
  const runtimeStatus = String(runtime?.source_status || '').toUpperCase();
  if (today?.is_trading_day === false) {
    return {
      code: 'NO_TRADE',
      headline: locale === 'zh' ? '今天不适合动作' : 'Do not trade today',
      subtitle: locale === 'zh' ? '市场已休市，今天更适合复盘。' : 'The market is closed. Today is better used for review.'
    };
  }
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return {
      code: 'DEFENSE',
      headline: locale === 'zh' ? '今天先防守' : 'Defend first today',
      subtitle: safety?.primary_risks?.[0] || 'Risk pressure is high. Capital protection first.'
    };
  }
  if (runtimeStatus === 'INSUFFICIENT_DATA' || runtimeStatus === 'WITHHELD') {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '今天先等等' : 'Wait today',
      subtitle: locale === 'zh' ? '当前数据边界不够干净，先等更清楚的判断。' : 'Data quality is limited. Wait for better signal clarity.'
    };
  }
  if (!bestSignal) {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '今天先等等' : 'Wait today',
      subtitle: locale === 'zh' ? '现在没有足够高质量的动作。' : 'No high-quality opportunity at the moment.'
    };
  }
  if (!bestSignal._actionable) {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '今天先等等' : 'Wait today',
      subtitle:
        bestSignal._dataStatus === 'WITHHELD'
          ? locale === 'zh'
            ? '信号因样本质量不足而被保留。'
            : 'The signal is withheld because sample quality is still weak.'
          : locale === 'zh'
            ? '信号还没到执行时点。'
            : 'The signal is not ready for execution.'
    };
  }
  if (String(bestSignal?.regime_id || '').toUpperCase() === 'RISK_OFF') {
    return {
      code: 'DEFENSE',
      headline: locale === 'zh' ? '今天先防守' : 'Defend first today',
      subtitle: locale === 'zh' ? '风险仍偏高，只适合防守型小动作。' : 'Market risk remains high. Only small defensive actions.'
    };
  }
  return {
    code: 'TRADE',
    headline: locale === 'zh' ? '今天可以动作' : 'Can trade today',
    subtitle: suggestionSubtitle(bestSignal, locale)
  };
}

function riskLevel(overallCode, bestSignal, locale) {
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') {
    return {
      level: 'danger',
      icon: '🔴',
      label: locale === 'zh' ? '危险' : 'Dangerous',
      explanation: locale === 'zh' ? '风险环境偏高，不要强行动作。' : 'High risk environment. Do not force trades.'
    };
  }
  if (!bestSignal || !bestSignal._actionable || ['EXPERIMENTAL', 'WITHHELD', 'INSUFFICIENT_DATA'].includes(bestSignal._dataStatus)) {
    return {
      level: 'medium',
      icon: '🟡',
      label: locale === 'zh' ? '中等' : 'Medium',
      explanation: locale === 'zh' ? '条件偏混合，保持低风险和高选择性。' : 'Conditions are mixed. Keep risk low and be selective.'
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: locale === 'zh' ? '稳' : 'Safe',
    explanation: locale === 'zh' ? '条件尚可，但仍只适合小仓位。' : 'Setup quality is acceptable. Small position only.'
  };
}

function suggestedPositionText(signal) {
  if (!signal) return '0% (wait)';
  const positionPct = Number(signal?.position_advice?.position_pct);
  if (Number.isFinite(positionPct) && positionPct > 0) {
    const capped = Math.min(positionPct, 20);
    return `${capped.toFixed(0)}% only`;
  }
  return '10% only';
}

function takeProfitText(signal) {
  const tp = Number(signal?.take_profit_levels?.[0]?.price);
  if (!Number.isFinite(tp)) return '--';
  return tp.toFixed(2);
}

function entryText(signal) {
  const entry = Number(signal?.entry_zone?.low ?? signal?.entry_min);
  if (!Number.isFinite(entry)) return '--';
  return entry.toFixed(2);
}

function entryRangeText(signal) {
  const low = Number(signal?.entry_zone?.low ?? signal?.entry_min);
  const high = Number(signal?.entry_zone?.high ?? signal?.entry_max ?? signal?.entry_zone?.low ?? signal?.entry_min);
  if (!Number.isFinite(low) && !Number.isFinite(high)) return '--';
  if (Number.isFinite(low) && Number.isFinite(high)) {
    if (Math.abs(low - high) < 0.005) return `${low.toFixed(2)}`;
    return `${low.toFixed(2)} - ${high.toFixed(2)}`;
  }
  const single = Number.isFinite(low) ? low : high;
  return Number(single).toFixed(2);
}

function stopLossText(signal) {
  const stop = Number(signal?.stop_loss?.price || signal?.invalidation_level);
  if (!Number.isFinite(stop)) return '--';
  return stop.toFixed(2);
}

function confidenceText(signal) {
  const confidence = Number(signal?.confidence ?? signal?.conviction);
  if (!Number.isFinite(confidence)) return '--';
  return `${Math.round(confidence * 100)}%`;
}

function generatedText(signal) {
  return signal?._freshness || '--';
}

function strategySourceText(signal) {
  return signal?.strategy_source || 'AI quant strategy';
}

function triggerFeedback(kind = 'soft') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (kind === 'confirm') {
    navigator.vibrate([8, 22, 10]);
    return;
  }
  navigator.vibrate(8);
}

function DecisionMark({ code }) {
  const tone = code === 'TRADE' ? 'trade' : code === 'WAIT' ? 'wait' : 'defense';
  return (
    <span className={`decision-mark decision-mark-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" className="decision-mark-icon" focusable="false">
        {code === 'TRADE' ? (
          <path d="M4.5 10.5 8 14l7.5-8" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        ) : code === 'WAIT' ? (
          <path d="M5 10h10" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        ) : (
          <path d="M10 4.5v11M4.5 10h11" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

function buildDemoFallbackSignal(assetClass, now) {
  const generatedAt = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
  if (assetClass === 'CRYPTO') {
    return {
      signal_id: 'demo-today-btc-fallback',
      symbol: 'BTC/USD',
      market: 'CRYPTO',
      asset_class: 'CRYPTO',
      direction: 'LONG',
      confidence: 0.79,
      conviction: 0.79,
      status: 'NEW',
      score: 84,
      entry_zone: { low: 66850, high: 67120 },
      stop_loss: { price: 64880 },
      invalidation_level: 64880,
      take_profit_levels: [{ price: 69420 }],
      position_advice: { position_pct: 12 },
      strategy_source: 'AI quant strategy',
      created_at: generatedAt,
      generated_at: generatedAt,
      freshness_label: '4m ago',
      data_status: 'DEMO_ONLY',
      source_status: 'DEMO_ONLY',
      source_label: 'DEMO_ONLY',
      source_transparency: {
        data_status: 'DEMO_ONLY',
        source_status: 'DEMO_ONLY',
        source_label: 'DEMO_ONLY'
      },
      _actionable: true,
      _dataStatus: 'DEMO_ONLY',
      _freshness: '4m ago'
    };
  }

  return {
    signal_id: 'demo-today-aapl-fallback',
    symbol: 'AAPL',
    market: 'US',
    asset_class: 'US_STOCK',
    direction: 'LONG',
    confidence: 0.81,
    conviction: 0.81,
    status: 'NEW',
    score: 85,
    entry_zone: { low: 198.4, high: 199.2 },
    stop_loss: { price: 193.6 },
    invalidation_level: 193.6,
    take_profit_levels: [{ price: 206.4 }],
    position_advice: { position_pct: 12 },
    strategy_source: 'AI quant strategy',
    created_at: generatedAt,
    generated_at: generatedAt,
    freshness_label: '4m ago',
    data_status: 'DEMO_ONLY',
    source_status: 'DEMO_ONLY',
    source_label: 'DEMO_ONLY',
    source_transparency: {
      data_status: 'DEMO_ONLY',
      source_status: 'DEMO_ONLY',
      source_label: 'DEMO_ONLY'
    },
    _actionable: true,
    _dataStatus: 'DEMO_ONLY',
    _freshness: '4m ago'
  };
}

function buildSignalFromDecision(decision, now) {
  const topAction = decision?.ranked_action_cards?.[0];
  const signal = topAction?.signal_payload;
  if (!signal) return null;
  const dataStatus = normalizeDataStatus({
    ...signal,
    data_status: topAction?.data_status,
    source_status: topAction?.source_status,
    source_label: topAction?.source_label
  });
  return {
    ...signal,
    _actionable: Boolean(topAction?.eligible),
    _dataStatus: dataStatus,
    _freshness: signal?.freshness_label || freshnessLabel(signal, now),
    strategy_source: topAction?.strategy_source || signal?.strategy_source || 'AI quant strategy',
    action_label: topAction?.action_label || null,
    portfolio_intent: topAction?.portfolio_intent || null,
    risk_note: topAction?.risk_note || null,
    brief_why_now: topAction?.brief_why_now || null,
    evidence_bundle: topAction?.evidence_bundle || null
  };
}

function overallFromDecision(decision, locale) {
  const call = decision?.today_call;
  if (!call) return null;
  return {
    code: call?.code || 'WAIT',
    headline: call?.headline || call?.summary || (locale === 'zh' ? '⚠️ 更适合等待' : '⚠️ Better to wait'),
    subtitle: call?.subtitle || decision?.risk_state?.user_message || (locale === 'zh' ? '决策快照已生成。' : 'Decision snapshot available.')
  };
}

function riskFromDecision(decision, locale) {
  const posture = String(decision?.risk_state?.posture || '').toUpperCase();
  if (!posture) return null;
  if (posture === 'DEFEND' || posture === 'WAIT') {
    return {
      level: 'danger',
      icon: '🔴',
      label: locale === 'zh' ? '危险' : 'Dangerous',
      explanation: decision?.risk_state?.user_message || (locale === 'zh' ? '高风险环境下，不要强行动作。' : 'High risk environment. Do not force trades.')
    };
  }
  if (posture === 'PROBE') {
    return {
      level: 'medium',
      icon: '🟡',
      label: locale === 'zh' ? '中等' : 'Medium',
      explanation: decision?.risk_state?.user_message || (locale === 'zh' ? '条件偏混合，保持低风险和高选择性。' : 'Conditions are mixed. Keep risk low and selective.')
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: locale === 'zh' ? '稳' : 'Safe',
    explanation: decision?.risk_state?.user_message || (locale === 'zh' ? '条件允许选择性动作。' : 'Conditions allow selective action.')
  };
}

export default function TodayTab({
  now,
  assetClass,
  today,
  safety,
  signals,
  topSignalEvidence,
  decision,
  engagement,
  runtime,
  locale = 'en',
  investorDemoEnabled,
  onAskAi,
  onPaperExecute,
  onOpenSignals,
  onOpenWeekly,
  onConfirmBoundary,
  onCompleteCheckIn
}) {
  const [activeSignal, setActiveSignal] = useState(null);

  const bestSignal = useMemo(
    () => pickBestSignal(signals, topSignalEvidence, assetClass, now),
    [signals, topSignalEvidence, assetClass, now]
  );
  const decisionSignal = useMemo(() => buildSignalFromDecision(decision, now), [decision, now]);
  const featuredSignal = useMemo(
    () => decisionSignal || bestSignal || (investorDemoEnabled ? buildDemoFallbackSignal(assetClass, now) : null),
    [decisionSignal, bestSignal, investorDemoEnabled, assetClass, now]
  );
  const overall =
    overallFromDecision(decision, locale) ||
    deriveOverallStatus({
      today,
      safety,
      runtime,
      bestSignal: featuredSignal,
      locale
    });

  const risk = riskFromDecision(decision, locale) || riskLevel(overall.code, featuredSignal, locale);
  const morningCheck = engagement?.daily_check_state || null;
  const uiRegime = engagement?.ui_regime_state || null;
  const recommendationChange = engagement?.recommendation_change || null;
  const noActionDay = !featuredSignal || !featuredSignal._actionable || overall.code === 'WAIT' || overall.code === 'DEFENSE' || overall.code === 'NO_TRADE';
  const posture = String(decision?.risk_state?.posture || decision?.summary?.risk_posture || 'WAIT').toUpperCase();
  const actionCopy = getActionCardCopy({
    posture,
    locale,
    seed: `${featuredSignal?.symbol || 'none'}:${recommendationChange?.change_type || 'stable'}`,
    actionState: noActionDay ? 'watch-only' : 'actionable'
  });
  const noActionCopy = getNoActionCopy({
    locale,
    posture,
    seed: `${featuredSignal?.symbol || 'none'}:${morningCheck?.status || 'pending'}`
  });
  const todayDateLabel = useMemo(
    () =>
      now.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: locale === 'zh' ? 'long' : 'short',
        day: 'numeric',
        weekday: 'long'
      }),
    [now, locale]
  );
  const quickTiles = [
    {
      key: 'mind',
      label: locale === 'zh' ? '先记住什么' : 'Keep in mind',
      value:
        noActionDay
          ? uiRegime?.protective_line || noActionCopy.notify
          : featuredSignal?.risk_note || risk.explanation,
      tone: 'mint'
    },
    {
      key: 'why',
      label: locale === 'zh' ? '为什么现在看它' : 'Why now',
      value:
        featuredSignal?.brief_why_now ||
        (noActionDay ? uiRegime?.humor_line || noActionCopy.notify : actionCopy.why_now),
      tone: 'sky'
    }
  ];
  const actionBandLabel =
    overall.code === 'TRADE'
      ? locale === 'zh'
        ? '可以动作'
        : 'Actionable'
      : overall.code === 'WAIT'
        ? locale === 'zh'
          ? '更适合等'
          : 'Wait mode'
      : locale === 'zh'
          ? '优先防守'
          : 'Defense first';
  const setupScoreLabel = featuredSignal ? `${locale === 'zh' ? '把握' : 'Conviction'} ${confidenceText(featuredSignal)}` : null;
  const convictionValue = featuredSignal ? confidenceText(featuredSignal) : (locale === 'zh' ? '等待' : 'Waiting');
  const actionDirectionLabel = noActionDay
    ? locale === 'zh'
      ? '先观察'
      : 'Watch only'
    : String(featuredSignal?.direction || '').toUpperCase() === 'SHORT'
      ? locale === 'zh'
        ? '偏防守'
        : 'Reduce risk'
      : locale === 'zh'
        ? '可以买入'
        : 'Buy setup';
  const positionSizeLabel = noActionDay
    ? locale === 'zh'
      ? '先空仓'
      : 'Stay in cash'
    : suggestedPositionText(featuredSignal);
  const riskChipLabel =
    risk.level === 'safe'
      ? locale === 'zh'
        ? '低风险'
        : 'Low risk'
      : risk.level === 'medium'
        ? locale === 'zh'
          ? '中风险'
          : 'Medium risk'
        : locale === 'zh'
          ? '高风险'
          : 'High risk';
  const actionWhyLine = noActionDay
    ? uiRegime?.completion_line || noActionCopy.completion
    : featuredSignal?.brief_why_now || actionCopy.why_now;
  const provenance = useMemo(
    () =>
      describeEvidenceMode({
        locale,
        sourceStatus: decision?.source_status || featuredSignal?.source_status || runtime?.source_status,
        dataStatus: decision?.data_status || featuredSignal?._dataStatus || runtime?.data_status,
        sourceType: featuredSignal?.source_type || decision?.source_type || runtime?.source_type
      }),
    [decision?.data_status, decision?.source_status, decision?.source_type, featuredSignal?._dataStatus, featuredSignal?.source_status, featuredSignal?.source_type, locale, runtime?.data_status, runtime?.source_status, runtime?.source_type]
  );
  const provenanceFreshness = featuredSignal ? generatedText(featuredSignal) : null;
  const climate = overall.code === 'TRADE'
    ? {
        name: locale === 'zh' ? '窗口打开' : 'Open lane',
        line: locale === 'zh' ? '今天可以动，但节奏要轻。' : 'Tradable today. Keep the size light.',
        tone: 'trade'
      }
    : overall.code === 'WAIT'
      ? {
          name: locale === 'zh' ? '天气偏混' : 'Mixed skies',
          line: locale === 'zh' ? '先等，不要抢第一下。' : 'Wait first. Do not force the first move.',
          tone: 'wait'
        }
      : overall.code === 'NO_TRADE'
        ? {
            name: locale === 'zh' ? '今天休市' : 'Market closed',
            line: locale === 'zh' ? '今天不做动作，只做复盘。' : 'No trading today. Use it for review.',
            tone: 'closed'
          }
        : {
            name: locale === 'zh' ? '风暴预警' : 'Storm watch',
            line: locale === 'zh' ? '先防守，不要扩张风险。' : 'Defend first. Do not add risk.',
            tone: 'defense'
          };
  const climateBand = [
    overall.code === 'TRADE' ? 'high' : overall.code === 'WAIT' ? 'mid' : 'low',
    noActionDay ? 'low' : Number(featuredSignal?.position_advice?.position_pct ?? 0) >= 14 ? 'high' : 'mid',
    risk.level === 'safe' ? 'low' : risk.level === 'medium' ? 'mid' : 'high'
  ];
  const todayPickSymbol = featuredSignal?.symbol || (locale === 'zh' ? '现金' : 'Cash');
  const actionCardKicker = noActionDay
    ? locale === 'zh'
      ? '今日观察'
      : 'Today watch'
    : locale === 'zh'
      ? '今日主选'
      : 'Today pick';
  const askPrompt = noActionDay
    ? (locale === 'zh' ? '为什么今天应该先等？' : 'Why should I wait today?')
    : (locale === 'zh' ? '用人话告诉我今天怎么买。' : 'Tell me how to take this trade in plain words.');

  if (activeSignal) {
    return (
      <SignalDetail
        signal={activeSignal}
        onBack={() => setActiveSignal(null)}
        t={(key, _v, fallback) => fallback || key}
        backLabel={locale === 'zh' ? '今天' : 'Today'}
      />
    );
  }

  const handleMainAction = () => {
    triggerFeedback(overall.code === 'TRADE' ? 'confirm' : 'soft');
    if (overall.code === 'TRADE' && featuredSignal && featuredSignal._actionable) {
      onCompleteCheckIn?.();
      onPaperExecute?.(featuredSignal);
      return;
    }
    if (overall.code === 'DEFENSE' || overall.code === 'NO_TRADE') {
      onConfirmBoundary?.();
      onAskAi?.('Give me today defense plan in simple actions.');
      return;
    }
    onOpenSignals?.();
  };

  return (
    <section className="stack-gap today-screen-redesign today-screen-native">
      <section className="today-summary-header">
        <div className="today-summary-copy">
          <p className="today-summary-date">{todayDateLabel}</p>
          <h1 className="today-summary-title">{locale === 'zh' ? '今日行动' : 'Today'}</h1>
        </div>
        <span className={`today-summary-status today-summary-status-${overall.code.toLowerCase()}`}>{actionBandLabel}</span>
      </section>

      <section className="today-screen-flow">
        <article className={`today-provenance-strip today-provenance-strip-${provenance.tone}`}>
          <div className="today-provenance-copy">
            <div className="today-provenance-head">
              <span className="today-provenance-badge">{provenance.label}</span>
              {provenanceFreshness ? <span className="today-provenance-meta">{provenanceFreshness}</span> : null}
            </div>
            <p className="today-provenance-note">{provenance.note}</p>
          </div>
          <span className="today-provenance-watermark" aria-hidden="true">
            {provenance.watermark}
          </span>
        </article>

        <article className={`glass-card today-climate-strip today-climate-${climate.tone}`}>
          <div className="today-climate-copy">
            <p className="today-climate-name">{climate.name}</p>
            <p className="today-climate-line">{climate.line}</p>
          </div>
          <div className="today-climate-band" aria-hidden="true">
            {climateBand.map((level, index) => (
              <span key={`${level}-${index}`} className={`today-climate-pill today-climate-pill-${level}`} />
            ))}
          </div>
        </article>

        <article
          className={`glass-card today-action-card today-action-card-${climate.tone}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (featuredSignal) {
              triggerFeedback('soft');
              setActiveSignal(featuredSignal);
            }
          }}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && featuredSignal) {
              event.preventDefault();
              triggerFeedback('soft');
              setActiveSignal(featuredSignal);
            }
          }}
        >
          <div className="today-action-card-head">
            <span className="today-action-kicker">{actionCardKicker}</span>
            {setupScoreLabel ? <span className="today-action-tag">{setupScoreLabel}</span> : null}
          </div>

          <div className="today-action-main">
            <div className="today-action-symbol-block">
              <h2 className="today-action-symbol">{todayPickSymbol}</h2>
              <p className="today-action-direction">{actionDirectionLabel}</p>
            </div>
            <DecisionMark code={overall.code} />
          </div>

          <div className="today-action-stats">
            <div className="today-action-stat">
              <span className="today-action-stat-label">{locale === 'zh' ? '把握' : 'Conviction'}</span>
              <span className="today-action-stat-value">{convictionValue}</span>
            </div>
            <div className="today-action-stat">
              <span className="today-action-stat-label">{locale === 'zh' ? '仓位' : 'Size'}</span>
              <span className="today-action-stat-value">{positionSizeLabel}</span>
            </div>
            <div className="today-action-stat">
              <span className="today-action-stat-label">{locale === 'zh' ? '风险' : 'Risk'}</span>
              <span className="today-action-stat-value">{riskChipLabel}</span>
            </div>
          </div>

          <p className="today-action-why">{actionWhyLine}</p>

          <div className="today-action-links">
            <button
              type="button"
              className="today-action-link"
              onClick={(event) => {
                event.stopPropagation();
                handleMainAction();
              }}
            >
              {overall.code === 'TRADE' && featuredSignal && featuredSignal._actionable
                ? locale === 'zh'
                  ? '打开计划'
                  : 'Open plan'
                : locale === 'zh'
                  ? '查看理由'
                  : 'See why'}
            </button>
            <button
              type="button"
              className="today-action-link"
              onClick={(event) => {
                event.stopPropagation();
                triggerFeedback('soft');
                onAskAi?.(askPrompt, {
                  page: 'today',
                  focus: noActionDay ? 'restraint' : 'top_action'
                });
              }}
            >
              {locale === 'zh' ? '问 Nova' : 'Ask Nova'}
            </button>
          </div>
        </article>

        <section className="today-summary-grid">
          {quickTiles.map((item) => (
            <article key={item.key} className={`glass-card today-summary-card today-summary-card-${item.tone}`}>
              <p className="today-summary-card-label">{item.label}</p>
              <p className="today-summary-card-value">{item.value}</p>
            </article>
          ))}
        </section>
      </section>
    </section>
  );
}

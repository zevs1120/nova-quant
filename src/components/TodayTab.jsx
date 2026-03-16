import { useMemo, useState } from 'react';
import SignalDetail from './SignalDetail';
import {
  getActionCardCopy,
  getDailyStanceCopy,
  getMorningCheckCopy,
  getNoActionCopy,
  getTodayRiskCopy
} from '../copy/novaCopySystem.js';

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
      headline: locale === 'zh' ? '❌ 今天不适合动作' : '❌ Not suitable to trade',
      subtitle: locale === 'zh' ? '市场已休市，今天更适合复盘。' : 'The market is closed. Today is better used for review.'
    };
  }
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return {
      code: 'DEFENSE',
      headline: locale === 'zh' ? '🛡 今天优先防守' : '🛡 Defense mode (market risk high)',
      subtitle: safety?.primary_risks?.[0] || 'Risk pressure is high. Capital protection first.'
    };
  }
  if (runtimeStatus === 'INSUFFICIENT_DATA' || runtimeStatus === 'WITHHELD') {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '⚠️ 更适合等待' : '⚠️ Better to wait',
      subtitle: locale === 'zh' ? '当前数据边界不够干净，先等更清楚的判断。' : 'Data quality is limited. Wait for better signal clarity.'
    };
  }
  if (!bestSignal) {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '⚠️ 更适合等待' : '⚠️ Better to wait',
      subtitle: locale === 'zh' ? '现在没有足够高质量的动作。' : 'No high-quality opportunity at the moment.'
    };
  }
  if (!bestSignal._actionable) {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '⚠️ 更适合等待' : '⚠️ Better to wait',
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
      headline: locale === 'zh' ? '🛡 今天优先防守' : '🛡 Defense mode (market risk high)',
      subtitle: locale === 'zh' ? '风险仍偏高，只适合防守型小动作。' : 'Market risk remains high. Only small defensive actions.'
    };
  }
  return {
    code: 'TRADE',
    headline: locale === 'zh' ? '✅ 今天可以动作' : '✅ Can trade today',
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

function mainButtonLabel(overallCode, locale) {
  if (overallCode === 'TRADE') return locale === 'zh' ? '按计划动作' : 'Follow strategy';
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') return locale === 'zh' ? '查看防守计划' : 'View defense plan';
  return locale === 'zh' ? '等待下一次清晰机会' : 'Wait for the next clean opportunity';
}

function sourceCaption(signal, investorDemoEnabled, locale) {
  if (!signal) return null;
  if (signal._dataStatus === 'DEMO_ONLY') {
    return locale === 'zh' ? '来源：DEMO_ONLY 演示信号，仅用于 investor walkthrough。' : 'Source: DEMO_ONLY fallback signal for investor walkthrough.';
  }
  if (investorDemoEnabled) {
    return locale === 'zh'
      ? '来源：当前仍在使用真实信号路径，只是持仓切到 demo。'
      : 'Source: the live signal path is still being used while demo holdings are on.';
  }
  return null;
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

function simpleRiskPercent(level) {
  if (level === 'danger') return 82;
  if (level === 'medium') return 56;
  return 28;
}

function trendPercent(signal) {
  const confidence = Number(signal?.confidence ?? signal?.conviction ?? 0);
  if (!Number.isFinite(confidence)) return 36;
  return Math.max(24, Math.min(88, Math.round(confidence * 100)));
}

function temperaturePercent(code) {
  if (code === 'DEFENSE' || code === 'NO_TRADE') return 26;
  if (code === 'WAIT') return 48;
  return 74;
}

function actionStanceLabel(code, locale) {
  if (code === 'DEFENSE' || code === 'NO_TRADE') {
    return locale === 'zh' ? '先降低风险' : 'Dial risk down';
  }
  if (code === 'WAIT') {
    return locale === 'zh' ? '先别急，等位置' : 'Wait for a cleaner spot';
  }
  return locale === 'zh' ? '可以试一点，但别太重' : 'You can try a little, not a lot';
}

function actionModeLabel(signal, noActionDay, locale) {
  if (noActionDay || !signal?._actionable) {
    return locale === 'zh' ? '今天以等待为主' : 'Today is mostly a wait';
  }
  const size = Number(signal?.position_advice?.position_pct ?? signal?.position_size_pct ?? 0);
  if (size >= 14) return locale === 'zh' ? '正常仓位，但别激进' : 'Normal size, stay disciplined';
  if (size > 0) return locale === 'zh' ? '轻仓试一点' : 'Light size only';
  return locale === 'zh' ? '先看，不急着上' : 'Watch first, move later';
}

function stanceSteps(overallCode, locale) {
  const active = overallCode === 'TRADE' ? 'move' : overallCode === 'WAIT' ? 'watch' : 'protect';
  const copy =
    locale === 'zh'
      ? {
          protect: '先稳住',
          watch: '先观察',
          probe: '轻仓试探',
          move: '按计划动作'
        }
      : {
          protect: 'Hold back',
          watch: 'Stay watchful',
          probe: 'Probe light',
          move: 'Move on plan'
        };
  return [
    { key: 'protect', label: copy.protect, active: active === 'protect' },
    { key: 'watch', label: copy.watch, active: active === 'watch' },
    { key: 'probe', label: copy.probe, active: active === 'move' || active === 'watch' ? false : active === 'probe' },
    { key: 'move', label: copy.move, active: active === 'move' }
  ];
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
  const historySignals = useMemo(
    () => recentSignals(signals, topSignalEvidence, assetClass, now, featuredSignal),
    [signals, topSignalEvidence, assetClass, now, featuredSignal]
  );
  const secondaryDecisionSignals = useMemo(
    () =>
      Array.isArray(decision?.ranked_action_cards)
        ? decision.ranked_action_cards
            .slice(1, 3)
            .map((row) => buildSignalFromDecision({ ranked_action_cards: [row] }, now))
            .filter(Boolean)
        : [],
    [decision, now]
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
  const buttonText = mainButtonLabel(overall.code, locale);
  const morningCheck = engagement?.daily_check_state || null;
  const wrapUp = engagement?.daily_wrap_up || null;
  const uiRegime = engagement?.ui_regime_state || null;
  const perceptionLayer = engagement?.perception_layer || null;
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
  const actionCardLead = noActionDay
    ? uiRegime?.protective_line || morningCheck?.arrival_line || noActionCopy.arrival
    : morningCheck?.arrival_line || uiRegime?.arrival_line || actionCopy.why_now;
  const actionCardSubline = recommendationChange?.changed
    ? recommendationChange.summary
    : noActionDay
      ? morningCheck?.ritual_line || uiRegime?.ritual_line || noActionCopy.notify
      : featuredSignal?.brief_why_now || morningCheck?.ritual_line || actionCopy.caution;
  const actionStateBadges = [
    featuredSignal ? { key: 'rank', label: actionCopy.badges.rank, tone: 'badge-neutral' } : null,
    recommendationChange?.changed ? { key: 'change', label: actionCopy.badges.updated, tone: 'badge-medium' } : null,
    morningCheck?.status === 'COMPLETED' ? { key: 'checked', label: actionCopy.badges.checked, tone: 'badge-triggered' } : null,
    noActionDay ? { key: 'restraint', label: actionCopy.badges.restraint, tone: 'badge-neutral' } : null
  ].filter(Boolean);
  const heroEyebrow = noActionDay
    ? locale === 'zh'
      ? '今日判断'
      : 'Today’s call'
    : actionCopy.title;
  const heroSupport = recommendationChange?.changed
    ? recommendationChange.summary
    : noActionDay
      ? uiRegime?.completion_line || noActionCopy.completion
      : overall.subtitle;
  const heroSignalMeta = featuredSignal
    ? `${featuredSignal._actionable ? String(signalDirection(featuredSignal)).toUpperCase() : 'WAIT'}${
        featuredSignal?.portfolio_intent ? ` · ${String(featuredSignal.portfolio_intent).replace(/_/g, ' ')}` : ''
      }`
    : locale === 'zh'
      ? '等待更清楚的条件'
      : 'Wait for cleaner conditions';
  const sourceLine = sourceCaption(featuredSignal, investorDemoEnabled, locale);
  const stanceRail = stanceSteps(overall.code, locale);
  const coachPlan = [
    {
      key: 'stance',
      label: locale === 'zh' ? '今天怎么站位' : 'Today’s stance',
      value: actionStanceLabel(overall.code, locale)
    },
    {
      key: 'size',
      label: locale === 'zh' ? '仓位节奏' : 'Sizing',
      value: actionModeLabel(featuredSignal, noActionDay, locale)
    },
    {
      key: 'risk',
      label: locale === 'zh' ? '先记住什么' : 'Keep in mind',
      value:
        noActionDay
          ? uiRegime?.protective_line || noActionCopy.notify
          : featuredSignal?.risk_note || risk.explanation
    }
  ];
  const fitnessRings = [
    {
      key: 'stance',
      label: locale === 'zh' ? '动作' : 'Move',
      progress: temperaturePercent(overall.code),
      tone: overall.code === 'TRADE' ? 'go' : overall.code === 'WAIT' ? 'watch' : 'hold',
      value: noActionDay
        ? locale === 'zh'
          ? '先等'
          : 'Wait'
        : locale === 'zh'
          ? '可动'
          : 'Ready'
    },
    {
      key: 'size',
      label: locale === 'zh' ? '仓位' : 'Size',
      progress: noActionDay ? 22 : trendPercent(featuredSignal),
      tone: noActionDay ? 'calm' : 'go',
      value:
        noActionDay
          ? locale === 'zh'
            ? '轻'
            : 'Light'
          : Number(featuredSignal?.position_advice?.position_pct ?? featuredSignal?.position_size_pct ?? 0) >= 14
            ? locale === 'zh'
              ? '正常'
              : 'Normal'
            : locale === 'zh'
              ? '轻'
              : 'Light'
    },
    {
      key: 'risk',
      label: locale === 'zh' ? '风险' : 'Risk',
      progress: simpleRiskPercent(risk.level),
      tone: risk.level === 'danger' ? 'hold' : risk.level === 'medium' ? 'watch' : 'go',
      value: risk.level === 'danger' ? (locale === 'zh' ? '高' : 'High') : risk.level === 'medium' ? (locale === 'zh' ? '中' : 'Mid') : (locale === 'zh' ? '低' : 'Low')
    }
  ];
  const heroPromptLine =
    locale === 'zh'
      ? `今天先记住：${coachPlan[2]?.value || risk.explanation}`
      : `Keep this in mind first: ${coachPlan[2]?.value || risk.explanation}`;

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
    <section className="stack-gap">
      <section className="today-fold">
        <article
          className={`glass-card beginner-best-suggestion today-action-card-compact today-command-card ritual-card ritual-reveal ritual-delay-1 ${noActionDay ? 'is-no-action-day' : 'is-action-day'} ${
            recommendationChange?.changed ? 'is-updated' : ''
          } ${morningCheck?.status === 'COMPLETED' ? 'is-confirmed' : ''}`}
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
          <div className="today-command-top">
            <div className="today-command-status">
              {perceptionLayer?.badge ? <span className="badge badge-neutral">{perceptionLayer.badge}</span> : null}
              {perceptionLayer?.ambient_label ? <span className="muted status-line">{perceptionLayer.ambient_label}</span> : null}
            </div>
            <div className="signal-badge-row">
              {featuredSignal ? <span className={`badge ${noActionDay ? 'badge-neutral' : 'badge-triggered'}`}>{confidenceText(featuredSignal)}</span> : null}
              {actionStateBadges.map((item) => (
                <span key={item.key} className={`badge ${item.tone}`}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="today-command-main">
            <div className="today-command-copy">
              <p className="today-hero-eyebrow">{heroEyebrow}</p>
              <h2 className="today-hero-title">{overall.headline}</h2>
              <p className="today-hero-subtitle">{actionCardLead}</p>
              <p className="today-command-prompt">{heroPromptLine}</p>
            </div>
            <div className="today-ring-cluster" aria-label={locale === 'zh' ? '今日状态环' : 'Today state rings'}>
              {fitnessRings.map((ring) => (
                <div
                  key={ring.key}
                  className={`today-ring-card today-ring-${ring.tone}`}
                  style={{ '--ring-progress': `${ring.progress}%` }}
                >
                  <div className="today-ring-shell">
                    <div className="today-ring-core">
                      <span className="today-ring-value">{ring.value}</span>
                    </div>
                  </div>
                  <span className="today-ring-label">{ring.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="ritual-kicker">{actionCardSubline}</p>
          <div className="stance-rail" aria-label={locale === 'zh' ? '今日立场' : 'Today stance'}>
            {stanceRail.map((item) => (
              <span key={item.key} className={`stance-step ${item.active ? 'active' : ''}`}>
                {item.label}
              </span>
            ))}
          </div>
          {!featuredSignal ? (
            <p className="muted status-line">
              {uiRegime?.completion_line || noActionCopy.completion}
            </p>
          ) : (
            <>
              <div className="today-hero-signal-row">
                <div className="today-hero-signal-copy">
                  <p className="today-action-line">{featuredSignal.symbol || '--'}</p>
                  <p className="today-hero-symbol-meta">{heroSignalMeta}</p>
                </div>
                <div className="today-hero-confidence-stack">
                  <span className="today-hero-confidence">{confidenceText(featuredSignal)}</span>
                  <span className="muted status-line">{generatedText(featuredSignal)}</span>
                </div>
              </div>

              {noActionDay ? (
                <div className="today-no-action-panel">
                  <p className="today-no-action-line">{uiRegime?.completion_line || noActionCopy.completion}</p>
                  <p className="muted status-line">
                    {featuredSignal?.risk_note ||
                      morningCheck?.completion_feedback ||
                      uiRegime?.protective_line ||
                      noActionCopy.notify}
                  </p>
                </div>
              ) : (
                <div className="today-coach-plan">
                  {coachPlan.map((item) => (
                    <div key={item.key} className="today-coach-pill">
                      <p className="today-coach-pill-label">{item.label}</p>
                      <p className="today-coach-pill-value">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="today-hero-notes">
                <p className="muted status-line">
                  {locale === 'zh' ? '今天计划' : 'Today’s plan'} · {actionModeLabel(featuredSignal, noActionDay, locale)}
                </p>
                <p className="muted status-line">
                  {featuredSignal?.brief_why_now ||
                    (noActionDay
                      ? uiRegime?.humor_line || noActionCopy.notify
                      : actionCopy.why_now)}
                </p>
                <p className="muted status-line">
                  {featuredSignal?.risk_note ||
                    (noActionDay
                      ? morningCheck?.completion_feedback || uiRegime?.protective_line || noActionCopy.arrival
                      : uiRegime?.humor_line || actionCopy.caution)}
                </p>
              </div>

              <div className="action-row today-action-row">
                <button
                  type="button"
                  className="primary-btn today-action-cta"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMainAction();
                  }}
                >
                  {featuredSignal._actionable ? (locale === 'zh' ? '生成今日计划' : 'Make today’s plan') : buttonText}
                </button>
                <button
                  type="button"
                  className="secondary-btn today-action-secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    triggerFeedback('soft');
                    onAskAi?.(noActionDay ? 'Why is waiting the better move today?' : 'Why is this the top action today?', {
                      page: 'today',
                      focus: noActionDay ? 'restraint' : 'top_action'
                    });
                  }}
                >
                  {locale === 'zh' ? '问问 Nova' : 'Ask Nova'}
                </button>
              </div>
              <p className="muted status-line action-card-footnote">
                {morningCheck?.status === 'COMPLETED'
                  ? morningCheck.completion_feedback
                  : noActionDay
                    ? uiRegime?.completion_line || noActionCopy.completion
                    : morningCheck?.ritual_line || actionCopy.caution}
              </p>
            </>
          )}
        </article>

        <article className={`glass-card today-follow-through-card ritual-delay-2 state-card state-card-${uiRegime?.tone || 'quiet'}`}>
          <div className="today-follow-through-head">
            <div>
              <p className="ritual-kicker">{locale === 'zh' ? '为什么是这个结论' : 'Why this is the call'}</p>
              <h3 className="card-title">{heroSupport}</h3>
            </div>
            <span className={`badge ${risk.level === 'safe' ? 'badge-triggered' : risk.level === 'medium' ? 'badge-medium' : 'badge-neutral'}`}>
              {risk.icon} {risk.label}
            </span>
          </div>
          <p className="muted status-line">{actionCardSubline}</p>
          <div className="today-follow-through-grid">
            <div className="today-follow-through-item">
              <p className="today-follow-through-label">{locale === 'zh' ? '为什么现在看它' : 'Why now'}</p>
              <p className="today-follow-through-value">
                {featuredSignal?.brief_why_now ||
                  (noActionDay ? uiRegime?.humor_line || noActionCopy.notify : actionCopy.why_now)}
              </p>
            </div>
            <div className="today-follow-through-item">
              <p className="today-follow-through-label">{locale === 'zh' ? '别忘了什么' : 'What keeps us honest'}</p>
              <p className="today-follow-through-value">
                {featuredSignal?.risk_note ||
                  (noActionDay
                    ? morningCheck?.completion_feedback || uiRegime?.protective_line || noActionCopy.arrival
                    : uiRegime?.humor_line || actionCopy.caution)}
              </p>
            </div>
          </div>
          {sourceLine ? <p className="muted status-line today-follow-through-source">{sourceLine}</p> : null}
        </article>

        {morningCheck ? (
          <article
            className={`glass-card morning-check-card ritual-card ritual-delay-3 morning-check-${String(morningCheck.status || '').toLowerCase()}`}
          >
            <div className="card-header">
              <div>
                <h3 className="card-title">{morningCheck.title}</h3>
                <p className="muted status-line">{morningCheck.headline}</p>
              </div>
              <span className={`badge ${morningCheck.status === 'COMPLETED' ? 'badge-triggered' : morningCheck.status === 'REFRESH_REQUIRED' ? 'badge-medium' : 'badge-neutral'}`}>
                {morningCheck.short_label}
              </span>
            </div>
            {morningCheck.arrival_line ? <p className="ritual-kicker">{morningCheck.arrival_line}</p> : null}
            <p className="daily-brief-conclusion">{morningCheck.prompt}</p>
            {morningCheck.ritual_line ? <p className="status-line">{morningCheck.ritual_line}</p> : null}
            {morningCheck.why_now ? <p className="muted status-line">{morningCheck.why_now}</p> : null}
            <div className="action-row">
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  triggerFeedback('confirm');
                  onCompleteCheckIn?.();
                }}
              >
                {morningCheck.cta_label || (morningCheck.status === 'COMPLETED' ? 'Checked for today' : morningCheck.status === 'REFRESH_REQUIRED' ? 'Review updated view' : 'Confirm today’s view')}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  triggerFeedback('soft');
                  onAskAi?.('Why today’s view?', { page: 'today', focus: 'morning_check' });
                }}
              >
                {morningCheck.ai_cta_label || 'Ask Nova'}
              </button>
            </div>
            {morningCheck.humor_line ? <p className="ritual-kicker">{morningCheck.humor_line}</p> : null}
            {morningCheck.completion_feedback ? <p className="muted status-line">{morningCheck.completion_feedback}</p> : null}
          </article>
        ) : null}
      </section>

      {(secondaryDecisionSignals.length || historySignals.length) ? (
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{secondaryDecisionSignals.length ? actionCopy.more_ranked_title : actionCopy.recent_signals_title}</h3>
              <p className="muted">
                {secondaryDecisionSignals.length
                  ? locale === 'zh'
                    ? '排在榜首之后的次级动作。'
                    : 'Lower-priority actions after the top decision.'
                  : locale === 'zh'
                    ? '用于 investor walkthrough 的最近示例。'
                    : 'Recent examples for the investor walkthrough.'}
              </p>
            </div>
          </div>
          <div className="demo-history-list">
            {(secondaryDecisionSignals.length ? secondaryDecisionSignals : historySignals).map((signal) => (
              <button
                key={signal.signal_id}
                type="button"
                className={`demo-history-row ${signal.symbol === recommendationChange?.current?.top_action_symbol ? 'is-promoted' : ''}`}
                onClick={() => {
                  triggerFeedback('soft');
                  setActiveSignal(signal);
                }}
              >
                <div>
                  <p className="quick-access-title">{signal.symbol}</p>
                  <p className="quick-access-desc">
                    {signalDirection(signal)} · {generatedText(signal)}
                  </p>
                </div>
                <div className="demo-history-meta">
                  <span className={`badge ${String(signal.demo_outcome_label || '').toLowerCase().includes('stop') ? 'badge-expired' : 'badge-triggered'}`}>
                    {signal.demo_outcome_label || confidenceText(signal)}
                  </span>
                  {signal.demo_outcome_note ? <span className="quick-access-desc">{signal.demo_outcome_note}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </article>
      ) : null}

      {wrapUp?.ready ? (
        <article className={`glass-card wrap-up-card ritual-card ritual-delay-4 ${wrapUp.completed ? 'is-confirmed' : ''}`}>
          <div className="card-header">
            <div>
              <h3 className="card-title">{wrapUp.title}</h3>
              <p className="muted status-line">{wrapUp.headline}</p>
            </div>
            <span className={`badge ${wrapUp.completed ? 'badge-triggered' : 'badge-neutral'}`}>{wrapUp.short_label}</span>
          </div>
          {wrapUp.opening_line ? <p className="ritual-kicker">{wrapUp.opening_line}</p> : null}
          <p className="muted status-line">{wrapUp.summary}</p>
          <div className="action-row">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                triggerFeedback('soft');
                onOpenWeekly?.();
              }}
            >
              {actionCopy.open_wrap_label}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                triggerFeedback('soft');
                onAskAi?.('What mattered most today?', { page: 'today', focus: 'wrap_up' });
              }}
            >
              {actionCopy.ask_nova_label}
            </button>
          </div>
          {wrapUp.completion_feedback ? <p className="muted status-line">{wrapUp.completion_feedback}</p> : null}
        </article>
      ) : null}
    </section>
  );
}

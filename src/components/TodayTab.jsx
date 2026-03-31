import { useEffect, useMemo, useRef, useState } from 'react';
import SignalDetail from './SignalDetail';
import TradeTicketSheet from './TradeTicketSheet';
import { describeEvidenceMode } from '../utils/provenance';
import {
  buildNovaTradeQuestion,
  buildTradeIntent,
  openTradeIntentHandoff,
  tradeIntentHandoffLabel,
} from '../utils/tradeIntent';
import { getTodayCardLimit, normalizeMembershipPlan } from '../utils/membership';
import {
  fetchSignalDetail,
  hasSignalDetailPayload,
  mergeSignalDetail,
} from '../utils/signalDetails';

const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);
const DATA_STATUS_PENALTY = {
  DB_BACKED: 0,
  MODEL_DERIVED: 6,
  PAPER_ONLY: 14,
  BACKTEST_ONLY: 18,
  DEMO_ONLY: 24,
  EXPERIMENTAL: 22,
  WITHHELD: 36,
  INSUFFICIENT_DATA: 48,
};

function normalizeDataStatus(signal) {
  const value = String(
    signal?.data_status ||
      signal?.source_label ||
      signal?.source_status ||
      signal?.source_transparency?.data_status ||
      signal?.source_transparency?.source_label ||
      signal?.source_transparency?.source_status ||
      'INSUFFICIENT_DATA',
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

function signalDecisionTone(signal) {
  if (!isActionable(signal)) return 'hold';
  return String(signal?.direction || '').toUpperCase() === 'SHORT' ? 'sell' : 'buy';
}

const ACTION_CARD_PALETTES = ['mint', 'pink', 'blue', 'violet', 'yellow'];

function hashCardPaletteSeed(seed) {
  const input = String(seed || 'novaquant');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function signalCardPalette(signal, offset = 0) {
  const seed = signalCardId(signal) || signal?.symbol || signal?.strategy_source || 'novaquant';
  const hash = hashCardPaletteSeed(seed);
  return ACTION_CARD_PALETTES[(hash + offset) % ACTION_CARD_PALETTES.length];
}

function actionCardDecisionLabel(signal, locale) {
  if (!signal || !signal._actionable) {
    return locale === 'zh' ? '先观察' : 'Watch first';
  }
  if (String(signal?.direction || '').toUpperCase() === 'SHORT') {
    return locale === 'zh' ? '先降风险' : 'Reduce risk';
  }
  return locale === 'zh' ? '买入准备' : 'Buy setup';
}

function actionCardTagLabel(signal, locale) {
  if (!signal || !signal._actionable) {
    return locale === 'zh' ? '先观察' : 'Watch first';
  }
  if (String(signal?.direction || '').toUpperCase() === 'SHORT') {
    return locale === 'zh' ? '风险收缩' : 'Reduce risk';
  }
  return locale === 'zh' ? '可执行' : 'Actionable';
}

function actionCardRiskText(signal, locale) {
  if (!signal || !signal._actionable) {
    return locale === 'zh' ? '观察优先' : 'Watch only';
  }
  if (String(signal?.direction || '').toUpperCase() === 'SHORT') {
    return locale === 'zh' ? '高风险' : 'High risk';
  }
  const confidence = Number(signal?.confidence ?? signal?.conviction);
  if (Number.isFinite(confidence) && confidence >= 0.72) {
    return locale === 'zh' ? '低风险' : 'Low risk';
  }
  if (Number.isFinite(confidence) && confidence >= 0.6) {
    return locale === 'zh' ? '中等风险' : 'Medium risk';
  }
  return locale === 'zh' ? '高风险' : 'High risk';
}

function actionCardExecutionText(signal, locale) {
  if (!signal || !signal._actionable) {
    return locale === 'zh' ? '等待确认后再动' : 'Wait for follow-through';
  }
  if (String(signal?.direction || '').toUpperCase() === 'SHORT') {
    return locale === 'zh' ? '反弹中先减仓' : 'Reduce into strength';
  }
  return locale === 'zh' ? '确认后再进场' : 'Open on confirmation';
}

function actionCardRiskGateText(signal, locale) {
  if (!signal || !signal._actionable) {
    return locale === 'zh' ? '保持耐心' : 'Stay patient';
  }
  if (String(signal?.direction || '').toUpperCase() === 'SHORT') {
    return locale === 'zh' ? '不要再加风险' : 'Do not add risk';
  }
  return locale === 'zh' ? '仓位继续放轻' : 'Keep size light';
}

function actionCardMetaLine(text, locale) {
  if (!text) {
    return locale === 'zh' ? '等待下一次系统快照' : 'WAITING FOR THE NEXT SYSTEM SNAPSHOT';
  }
  return String(text).replaceAll('•', '·').toUpperCase();
}

function actionCardPickLabel(position, locale) {
  const numeric = String(Math.max(1, Number(position) || 1)).padStart(2, '0');
  return locale === 'zh' ? `Today 卡片 ${numeric}` : `Today pick ${numeric}`;
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
        'INSUFFICIENT_DATA',
    ).toUpperCase();
    return {
      ...base,
      signal_id: row.signal_id || base.signal_id,
      symbol: row.symbol || base.symbol,
      market: row.market || base.market,
      asset_class: row.asset_class || base.asset_class,
      direction: row.direction || base.direction,
      confidence: Number.isFinite(Number(row.conviction))
        ? Number(row.conviction)
        : base.confidence,
      created_at: base.created_at || row.created_at || row.generated_at || null,
      entry_zone: row.entry_zone || base.entry_zone || null,
      stop_loss:
        base.stop_loss ||
        (Number.isFinite(Number(row.invalidation))
          ? {
              type: 'EVIDENCE',
              price: Number(row.invalidation),
              rationale: 'Evidence-derived invalidation',
            }
          : null),
      invalidation_level: Number.isFinite(Number(base.invalidation_level))
        ? base.invalidation_level
        : Number(row.invalidation),
      take_profit_levels: base.take_profit_levels || [],
      position_advice: base.position_advice || null,
      explain_bullets: base.explain_bullets || (row.thesis ? [row.thesis] : []),
      status: base.status || (row.actionable ? 'NEW' : 'WITHHELD'),
      score: Number.isFinite(Number(base.score))
        ? Number(base.score)
        : Number(row.conviction || 0) * 100,
      source_transparency: row.source_transparency || base.source_transparency || null,
      source_status:
        row.source_transparency?.source_status || base.source_status || 'INSUFFICIENT_DATA',
      source_label:
        row.source_transparency?.source_label || base.source_label || evidenceDataStatus,
      data_status: base.data_status || evidenceDataStatus,
      freshness_label: row.freshness_label || null,
      actionable: Boolean(row.actionable),
      supporting_run_id: row.supporting_run_id || null,
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
      _freshness: item?.freshness_label || freshnessLabel(item, now),
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
      _freshness: item?.freshness_label || freshnessLabel(item, now),
    }))
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 3);
}

function suggestionSubtitle(bestSignal, locale) {
  if (!bestSignal) {
    return locale === 'zh'
      ? '暂时没有足够干净的动作，先等更清楚的条件。'
      : 'No clean setup yet. Better conditions are worth waiting for.';
  }
  if (!bestSignal._actionable) {
    return locale === 'zh'
      ? '信号存在，但还不值得执行。'
      : 'There is a signal, but not an executable one yet.';
  }
  if (bestSignal.direction === 'SHORT') {
    return locale === 'zh'
      ? '风险仍偏高，只允许小而严格的动作。'
      : 'Risk is still elevated. Keep size small and execution strict.';
  }
  return locale === 'zh'
    ? '今天可以看动作，但仓位仍然要轻。'
    : 'Selective action is workable today. Size still stays light.';
}

function deriveOverallStatus(args) {
  const { today, safety, runtime, bestSignal, locale } = args;
  const mode = String(safety?.mode || '').toLowerCase();
  const runtimeStatus = String(runtime?.source_status || '').toUpperCase();
  if (today?.is_trading_day === false) {
    return {
      code: 'NO_TRADE',
      headline: locale === 'zh' ? '今天不适合动作' : 'Do not trade today',
      subtitle:
        locale === 'zh'
          ? '市场已休市，今天更适合复盘。'
          : 'The market is closed. Today is better used for review.',
    };
  }
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return {
      code: 'DEFENSE',
      headline: locale === 'zh' ? '今天先防守' : 'Defend first today',
      subtitle: safety?.primary_risks?.[0] || 'Risk pressure is high. Capital protection first.',
    };
  }
  if (runtimeStatus === 'INSUFFICIENT_DATA' || runtimeStatus === 'WITHHELD') {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '今天先等等' : 'Wait today',
      subtitle:
        locale === 'zh'
          ? '当前数据边界不够干净，先等更清楚的判断。'
          : 'Data quality is limited. Wait for better signal clarity.',
    };
  }
  if (!bestSignal) {
    return {
      code: 'WAIT',
      headline: locale === 'zh' ? '今天先等等' : 'Wait today',
      subtitle:
        locale === 'zh'
          ? '现在没有足够高质量的动作。'
          : 'No high-quality opportunity at the moment.',
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
            : 'The signal is not ready for execution.',
    };
  }
  if (String(bestSignal?.regime_id || '').toUpperCase() === 'RISK_OFF') {
    return {
      code: 'DEFENSE',
      headline: locale === 'zh' ? '今天先防守' : 'Defend first today',
      subtitle:
        locale === 'zh'
          ? '风险仍偏高，只适合防守型小动作。'
          : 'Market risk remains high. Only small defensive actions.',
    };
  }
  return {
    code: 'TRADE',
    headline: locale === 'zh' ? '今天可以动作' : 'Can trade today',
    subtitle: suggestionSubtitle(bestSignal, locale),
  };
}

function riskLevel(overallCode, bestSignal, locale) {
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') {
    return {
      level: 'danger',
      icon: '🔴',
      label: locale === 'zh' ? '危险' : 'Dangerous',
      explanation:
        locale === 'zh'
          ? '风险环境偏高，不要强行动作。'
          : 'High risk environment. Do not force trades.',
    };
  }
  if (
    !bestSignal ||
    !bestSignal._actionable ||
    ['EXPERIMENTAL', 'WITHHELD', 'INSUFFICIENT_DATA'].includes(bestSignal._dataStatus)
  ) {
    return {
      level: 'medium',
      icon: '🟡',
      label: locale === 'zh' ? '谨慎' : 'Caution',
      explanation:
        locale === 'zh'
          ? '条件偏混合，保持低风险和高选择性。'
          : 'Conditions are mixed. Keep risk low and be selective.',
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: locale === 'zh' ? '稳' : 'Safe',
    explanation:
      locale === 'zh'
        ? '条件尚可，但仍只适合小仓位。'
        : 'Setup quality is acceptable. Small position only.',
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
  const high = Number(
    signal?.entry_zone?.high ?? signal?.entry_max ?? signal?.entry_zone?.low ?? signal?.entry_min,
  );
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

function buildActionMetaText({ locale, signal, provenance }) {
  const parts = [
    provenance?.label || null,
    signal ? generatedText(signal) : null,
    signal ? strategySourceText(signal) : null,
  ].filter((item) => item && item !== '--');

  if (parts.length) return parts.join(' • ');
  return locale === 'zh' ? '等待下一次系统快照' : 'Waiting for the next system snapshot';
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
  const tone =
    code === 'TRADE'
      ? 'trade'
      : code === 'WAIT'
        ? 'wait'
        : code === 'UNAVAILABLE'
          ? 'wait'
          : 'defense';
  return (
    <span className={`decision-mark decision-mark-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" className="decision-mark-icon" focusable="false">
        {code === 'TRADE' ? (
          <path
            d="M4.5 10.5 8 14l7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : code === 'WAIT' ? (
          <path
            d="M5 10h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M10 4.5v11M4.5 10h11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
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
        source_label: 'DEMO_ONLY',
      },
      _actionable: true,
      _dataStatus: 'DEMO_ONLY',
      _freshness: '4m ago',
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
      source_label: 'DEMO_ONLY',
    },
    _actionable: true,
    _dataStatus: 'DEMO_ONLY',
    _freshness: '4m ago',
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
    source_label: topAction?.source_label,
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
    evidence_bundle: topAction?.evidence_bundle || null,
  };
}

function buildSignalsFromDecision(decision, now) {
  return (decision?.ranked_action_cards || [])
    .map((card, index) => {
      const signal = card?.signal_payload;
      if (!signal) return null;
      const dataStatus = normalizeDataStatus({
        ...signal,
        data_status: card?.data_status,
        source_status: card?.source_status,
        source_label: card?.source_label,
      });
      return {
        ...signal,
        _actionable: Boolean(card?.eligible),
        _dataStatus: dataStatus,
        _freshness: signal?.freshness_label || freshnessLabel(signal, now),
        strategy_source: card?.strategy_source || signal?.strategy_source || 'AI quant strategy',
        action_label: card?.action_label || null,
        portfolio_intent: card?.portfolio_intent || null,
        risk_note: card?.risk_note || null,
        brief_why_now: card?.brief_why_now || null,
        evidence_bundle: card?.evidence_bundle || null,
        ranking_score: Number(card?.ranking_score || signal?.score || 0),
        _cardActionId: card?.action_id || `decision-card-${index + 1}`,
        _cardTone: card?.eligible ? 'live' : 'watch',
      };
    })
    .filter(Boolean);
}

function buildSignalRail(signals, evidenceSignals, assetClass, now, limit = 10) {
  const merged = mergeEvidenceSignals(signals, evidenceSignals);
  return (merged || [])
    .filter((item) => {
      const signalAsset = item.asset_class || (item.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
      return signalAsset === assetClass;
    })
    .map((item) => ({
      ...item,
      _rank: rankSignal(item, now),
      _dataStatus: normalizeDataStatus(item),
      _actionable: isActionable(item),
      _freshness: item?.freshness_label || freshnessLabel(item, now),
      ranking_score: rankSignal(item, now),
      _cardActionId:
        item?.signal_id ||
        `${item?.symbol || 'signal'}-${item?.created_at || item?.generated_at || 'na'}`,
      _cardTone: isActionable(item) ? 'live' : 'watch',
    }))
    .sort((a, b) => b._rank - a._rank)
    .slice(0, limit);
}

function signalCardId(signal) {
  return (
    signal?._cardActionId ||
    signal?.signal_id ||
    `${signal?.symbol || 'signal'}-${signal?.created_at || signal?.generated_at || 'na'}`
  );
}

function signalQuotaForTradeMode(tradeMode) {
  const mode = String(tradeMode || '').toLowerCase();
  if (mode === 'deep') return 12;
  if (mode === 'active') return 8;
  return 4;
}

function signalConfidenceScore(signal) {
  const calibrated = Number(signal?.calibrated_confidence);
  if (Number.isFinite(calibrated)) return calibrated;
  const confidence = Number(signal?.confidence ?? signal?.conviction);
  if (Number.isFinite(confidence)) return confidence;
  return -1;
}

function sortSignalsForDisplay(list = []) {
  return [...list].sort((a, b) => {
    const confidenceDelta = signalConfidenceScore(b) - signalConfidenceScore(a);
    if (Math.abs(confidenceDelta) > 0.0001) return confidenceDelta;
    const rankDelta =
      Number(b?.ranking_score || b?._rank || 0) - Number(a?.ranking_score || a?._rank || 0);
    if (Math.abs(rankDelta) > 0.001) return rankDelta;
    const freshnessDelta =
      timestampMs(b?.created_at || b?.generated_at || 0) -
      timestampMs(a?.created_at || a?.generated_at || 0);
    return freshnessDelta;
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveTodayGestureIntent(dx, dy, vx = 0, vy = 0) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const absVx = Math.abs(vx);
  const absVy = Math.abs(vy);
  if ((dy <= -78 || (vy < -0.48 && absDy > 18)) && absDy > absDx * 1.02) return 'later';
  if (
    (absDx >= 68 || (absVx > 0.42 && absDx > 16)) &&
    absDx > Math.max(absDy * 1.02, 18)
  ) {
    return dx > 0 ? 'accept' : 'skip';
  }
  return null;
}

function isNestedInteractiveTarget(target, currentTarget) {
  return (
    target instanceof HTMLElement &&
    target !== currentTarget &&
    Boolean(target.closest('[data-gesture-ignore="true"], button, a, input, textarea, select'))
  );
}

function createGesturePreview() {
  return {
    signalId: null,
    dx: 0,
    dy: 0,
    rotate: 0,
    intent: null,
    active: false,
    committed: false,
  };
}

function overallFromDecision(decision, locale) {
  const call = decision?.today_call;
  if (!call) return null;
  return {
    code: call?.code || 'WAIT',
    headline:
      call?.headline || call?.summary || (locale === 'zh' ? '⚠️ 更适合等待' : '⚠️ Better to wait'),
    subtitle:
      call?.subtitle ||
      decision?.risk_state?.user_message ||
      (locale === 'zh' ? '决策快照已生成。' : 'Decision snapshot available.'),
  };
}

function riskFromDecision(decision, locale) {
  const posture = String(decision?.risk_state?.posture || '').toUpperCase();
  const callCode = String(decision?.today_call?.code || '').toUpperCase();
  if (callCode === 'UNAVAILABLE') {
    return {
      level: 'danger',
      icon: '🔴',
      label: locale === 'zh' ? '未就绪' : 'Unavailable',
      explanation:
        decision?.today_call?.subtitle ||
        (locale === 'zh'
          ? '系统运行状态还不完整，当前不应做交易动作。'
          : 'System runtime is incomplete, so no trading action should be taken.'),
    };
  }
  if (!posture) return null;
  if (posture === 'DEFEND' || posture === 'WAIT') {
    return {
      level: 'danger',
      icon: '🔴',
      label: locale === 'zh' ? '危险' : 'Dangerous',
      explanation:
        decision?.risk_state?.user_message ||
        (locale === 'zh'
          ? '高风险环境下，不要强行动作。'
          : 'High risk environment. Do not force trades.'),
    };
  }
  if (posture === 'PROBE') {
    return {
      level: 'medium',
      icon: '🟡',
      label: locale === 'zh' ? '谨慎' : 'Caution',
      explanation:
        decision?.risk_state?.user_message ||
        (locale === 'zh'
          ? '条件偏混合，保持低风险和高选择性。'
          : 'Conditions are mixed. Keep risk low and selective.'),
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: locale === 'zh' ? '稳' : 'Safe',
    explanation:
      decision?.risk_state?.user_message ||
      (locale === 'zh' ? '条件允许选择性动作。' : 'Conditions allow selective action.'),
  };
}

export default function TodayTab({
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
  brokerProfile,
  brokerConnection,
  onAskAi,
  onPaperExecute,
  onOpenSignals,
  onOpenWeekly,
  onConfirmBoundary,
  onCompleteCheckIn,
  effectiveUserId,
  membershipPlan = 'free',
  onOpenMembershipPrompt,
}) {
  // Self-managed clock — keeps App free from 30s re-render cycles
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const [activeSignal, setActiveSignal] = useState(null);
  const [tradeSignal, setTradeSignal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [queueIds, setQueueIds] = useState([]);
  const [queueReady, setQueueReady] = useState(false);
  const [pendingExecution, setPendingExecution] = useState(null);
  const [gesturePreview, setGesturePreview] = useState(createGesturePreview);
  const swipeGestureRef = useRef({
    pointerId: null,
    signalId: null,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    rotationDirection: 1,
    dragging: false,
    suppressTapUntil: 0,
  });
  const swipeTimerRef = useRef(null);
  const gestureFrameRef = useRef(0);
  const gesturePreviewRef = useRef(createGesturePreview());
  const previousDeckIdsRef = useRef([]);
  const featuredCardRef = useRef(null);
  const desiredSignalCount = useMemo(
    () => signalQuotaForTradeMode(brokerProfile?.tradeMode),
    [brokerProfile?.tradeMode],
  );
  const normalizedMembershipPlan = useMemo(
    () => normalizeMembershipPlan(membershipPlan),
    [membershipPlan],
  );
  const todayCardLimit = useMemo(
    () => getTodayCardLimit(normalizedMembershipPlan),
    [normalizedMembershipPlan],
  );

  const bestSignal = useMemo(
    () => pickBestSignal(signals, topSignalEvidence, assetClass, now),
    [signals, topSignalEvidence, assetClass, now],
  );
  const decisionSignals = useMemo(() => buildSignalsFromDecision(decision, now), [decision, now]);
  const fallbackSignals = useMemo(
    () => buildSignalRail(signals, topSignalEvidence, assetClass, now, desiredSignalCount),
    [signals, topSignalEvidence, assetClass, now, desiredSignalCount],
  );
  const actionSignals = useMemo(() => {
    if (decisionSignals.length) return decisionSignals;
    if (fallbackSignals.length) return fallbackSignals.slice(0, desiredSignalCount);
    return investorDemoEnabled ? [buildDemoFallbackSignal(assetClass, now)] : [];
  }, [decisionSignals, fallbackSignals, desiredSignalCount, investorDemoEnabled, assetClass, now]);
  const deckSignals = useMemo(() => sortSignalsForDisplay(actionSignals), [actionSignals]);
  const visibleDeckSignals = useMemo(
    () => (todayCardLimit === null ? deckSignals : deckSignals.slice(0, todayCardLimit)),
    [deckSignals, todayCardLimit],
  );
  const hiddenDeckCount = Math.max(0, deckSignals.length - visibleDeckSignals.length);

  useEffect(() => {
    const nextIds = visibleDeckSignals.map((signal) => signalCardId(signal));
    const previousIds = previousDeckIdsRef.current;
    const deckChanged =
      nextIds.length !== previousIds.length ||
      nextIds.some((id, index) => id !== previousIds[index]);

    setQueueIds((current) => {
      if (!nextIds.length) return [];
      if (!current.length && !queueReady) return nextIds;
      const retained = current.filter((id) => nextIds.includes(id));
      if (!deckChanged) return retained;
      const appended = nextIds.filter((id) => !retained.includes(id));
      return [...retained, ...appended];
    });
    previousDeckIdsRef.current = nextIds;
    setQueueReady(true);
  }, [queueReady, visibleDeckSignals]);

  useEffect(
    () => () => {
      if (swipeTimerRef.current) {
        window.clearTimeout(swipeTimerRef.current);
      }
      if (gestureFrameRef.current) {
        window.cancelAnimationFrame(gestureFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeSignal?.signal_id || hasSignalDetailPayload(activeSignal)) {
      setDetailLoading(false);
      setDetailError('');
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');

    fetchSignalDetail(activeSignal.signal_id, { userId: effectiveUserId })
      .then((detail) => {
        if (cancelled || !detail) return;
        setActiveSignal((current) => {
          if (!current || current.signal_id !== activeSignal.signal_id) return current;
          return mergeSignalDetail(current, detail);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDetailError(
          locale === 'zh'
            ? '完整计划加载失败，先展示摘要。'
            : 'Full plan unavailable. Showing the summary first.',
        );
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSignal, effectiveUserId, locale]);

  const queuedSignals = useMemo(() => {
    if (!queueReady) return visibleDeckSignals;
    const byId = new Map(visibleDeckSignals.map((signal) => [signalCardId(signal), signal]));
    return queueIds.map((id) => byId.get(id)).filter(Boolean);
  }, [queueIds, queueReady, visibleDeckSignals]);

  const featuredSignal = queuedSignals[0] || null;
  const overall =
    overallFromDecision(decision, locale) ||
    deriveOverallStatus({
      today,
      safety,
      runtime,
      bestSignal: featuredSignal,
      locale,
    });

  const risk =
    riskFromDecision(decision, locale) || riskLevel(overall.code, featuredSignal, locale);
  const climateVisualTone =
    risk?.level === 'danger'
      ? 'danger'
      : risk?.level === 'medium'
        ? 'medium'
        : risk?.level === 'safe'
          ? 'safe'
          : overall.code === 'DEFENSE' || overall.code === 'UNAVAILABLE'
            ? 'danger'
            : overall.code === 'TRADE'
              ? 'safe'
              : 'medium';
  const noActionDay =
    !featuredSignal ||
    !featuredSignal._actionable ||
    overall.code === 'WAIT' ||
    overall.code === 'DEFENSE' ||
    overall.code === 'NO_TRADE' ||
    overall.code === 'UNAVAILABLE';
  const todayDateLabel = useMemo(
    () =>
      now.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
        month: locale === 'zh' ? 'long' : 'short',
        day: 'numeric',
        weekday: 'long',
      }),
    [now, locale],
  );
  const provenance = useMemo(
    () =>
      describeEvidenceMode({
        locale,
        sourceStatus:
          decision?.source_status || featuredSignal?.source_status || runtime?.source_status,
        dataStatus: decision?.data_status || featuredSignal?._dataStatus || runtime?.data_status,
        sourceType: featuredSignal?.source_type || decision?.source_type || runtime?.source_type,
      }),
    [
      decision?.data_status,
      decision?.source_status,
      decision?.source_type,
      featuredSignal?._dataStatus,
      featuredSignal?.source_status,
      featuredSignal?.source_type,
      locale,
      runtime?.data_status,
      runtime?.source_status,
      runtime?.source_type,
    ],
  );
  const climate =
    overall.code === 'TRADE'
      ? {
          name: locale === 'zh' ? '窗口打开' : 'Open lane',
          line:
            locale === 'zh' ? '今天可以动，但节奏要轻。' : 'Tradable today. Keep the size light.',
          tone: 'trade',
        }
      : overall.code === 'UNAVAILABLE'
        ? {
            name: locale === 'zh' ? '系统离线' : 'System offline',
            line:
              locale === 'zh'
                ? '先修运行链路，不要把空结果当成现金信号。'
                : 'Fix the runtime path first. Do not mistake empty output for a cash signal.',
            tone: 'wait',
          }
        : overall.code === 'WAIT'
          ? {
              name: locale === 'zh' ? '天气偏混' : 'Mixed skies',
              line:
                locale === 'zh'
                  ? '先等，不要抢第一下。'
                  : 'Wait first. Do not force the first move.',
              tone: 'wait',
            }
          : overall.code === 'NO_TRADE'
            ? {
                name: locale === 'zh' ? '今天休市' : 'Market closed',
                line:
                  locale === 'zh'
                    ? '今天不做动作，只做复盘。'
                    : 'No trading today. Use it for review.',
                tone: 'closed',
              }
            : {
                name: locale === 'zh' ? '风暴预警' : 'Storm watch',
                line: locale === 'zh' ? '先防守，不要扩张风险。' : 'Defend first. Do not add risk.',
                tone: 'defense',
              };
  const featuredSignalId = featuredSignal ? signalCardId(featuredSignal) : null;
  const signalDirectionValue = String(featuredSignal?.direction || '').toUpperCase();
  const actionLabel =
    !featuredSignal || noActionDay
      ? 'Hold'
      : signalDecisionTone(featuredSignal) === 'sell'
        ? 'Sell'
        : 'Buy';
  const decisionTone = actionLabel.toLowerCase();
  const askPrompt = featuredSignal
    ? buildNovaTradeQuestion(
        featuredSignal,
        buildTradeIntent(featuredSignal, {
          broker: brokerProfile?.broker,
          brokerSnapshot: brokerConnection,
        }),
        locale,
      )
    : locale === 'zh'
      ? '用人话告诉我，今天为什么应该先等。'
      : 'Tell me in plain words why today should stay in wait mode.';
  const tradeIntent = useMemo(
    () =>
      tradeSignal
        ? buildTradeIntent(tradeSignal, {
            broker: brokerProfile?.broker,
            brokerSnapshot: brokerConnection,
          })
        : null,
    [tradeSignal, brokerProfile?.broker, brokerConnection],
  );
  const buildSignalIntent = (signal) =>
    buildTradeIntent(signal, { broker: brokerProfile?.broker, brokerSnapshot: brokerConnection });
  const activeSignalIntent = activeSignal ? buildSignalIntent(activeSignal) : null;
  const featuredSignalIntent = featuredSignal ? buildSignalIntent(featuredSignal) : null;
  const actionMetaText = buildActionMetaText({
    locale,
    signal: featuredSignal,
    provenance,
  });
  const featuredCardPalette = signalCardPalette(featuredSignal);
  const featuredCardPosition = featuredSignalId
    ? Math.max(1, deckSignals.findIndex((signal) => signalCardId(signal) === featuredSignalId) + 1)
    : 1;
  const featuredCardKicker = actionCardPickLabel(featuredCardPosition, locale);
  const featuredDecisionLabel = actionCardDecisionLabel(featuredSignal, locale);
  const featuredTagLabel = actionCardTagLabel(featuredSignal, locale);
  const featuredRiskLabel = actionCardRiskText(featuredSignal, locale);
  const featuredExecutionLabel = actionCardExecutionText(featuredSignal, locale);
  const featuredRiskGateLabel = actionCardRiskGateText(featuredSignal, locale);
  const featuredMetaLine = actionCardMetaLine(actionMetaText, locale);
  const featuredPrimaryActionLabel = featuredSignalIntent?.canOpenBroker
    ? tradeIntentHandoffLabel(featuredSignalIntent, locale)
    : locale === 'zh'
      ? '打开交易票据'
      : 'Open trade ticket';
  const activeSwipeIntent =
    gesturePreview.signalId === featuredSignalId ? gesturePreview.intent || null : null;
  const deckGestureActive =
    gesturePreview.signalId === featuredSignalId &&
    (gesturePreview.active || gesturePreview.committed);
  const gestureStrengths =
    gesturePreview.signalId === featuredSignalId && deckGestureActive
      ? {
          skip: clampNumber(Math.max(0, -(gesturePreview.dx || 0)) / 132, 0, 1),
          accept: clampNumber(Math.max(0, gesturePreview.dx || 0) / 132, 0, 1),
          later: clampNumber(Math.max(0, -(gesturePreview.dy || 0)) / 138, 0, 1),
        }
      : { skip: 0, accept: 0, later: 0 };
  const climateStatusLabel =
    overall.code === 'UNAVAILABLE'
      ? locale === 'zh'
        ? '运行警告'
        : 'Runtime caution'
      : risk?.label || (locale === 'zh' ? '已准备' : 'Ready');

  const openTradeTicket = (signal) => {
    if (!signal) return;
    triggerFeedback('confirm');
    setTradeSignal(signal);
  };

  const askNovaAboutSignal = (signal, intent = null) => {
    if (!signal) return;
    const nextIntent = intent || buildSignalIntent(signal);
    onAskAi?.(buildNovaTradeQuestion(signal, nextIntent, locale), {
      page: 'today',
      focus: 'execution',
      signalId: signal.signal_id,
      symbol: signal.symbol,
      market: signal.market,
      assetClass: signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK'),
      timeframe: signal.timeframe,
      decisionSummary: {
        top_action_id: signal.signal_id,
        top_action_symbol: signal.symbol,
        top_action_label: signal.action_label || signal.strategy_source || 'Action card',
      },
    });
  };

  const syncGestureCard = (preview) => {
    const cardElement = featuredCardRef.current;
    if (!cardElement) return;
    cardElement.style.setProperty('--gesture-x', `${preview.dx || 0}px`);
    cardElement.style.setProperty('--gesture-y', `${preview.dy || 0}px`);
    cardElement.style.setProperty('--gesture-rotate', `${preview.rotate || 0}deg`);
    cardElement.style.setProperty(
      '--gesture-skip-strength',
      `${clampNumber(Math.max(0, -(preview.dx || 0)) / 132, 0, 1)}`,
    );
    cardElement.style.setProperty(
      '--gesture-accept-strength',
      `${clampNumber(Math.max(0, preview.dx || 0) / 132, 0, 1)}`,
    );
    cardElement.style.setProperty(
      '--gesture-later-strength',
      `${clampNumber(Math.max(0, -(preview.dy || 0)) / 138, 0, 1)}`,
    );
    cardElement.dataset.gestureActive = preview.active ? 'true' : 'false';
    cardElement.dataset.gestureIntent = preview.intent || 'idle';
    cardElement.dataset.gestureCommitted = preview.committed ? 'true' : 'false';
  };

  const pushGesturePreview = (nextPreview) => {
    gesturePreviewRef.current = nextPreview;
    syncGestureCard(nextPreview);
    if (gestureFrameRef.current) return;
    gestureFrameRef.current = window.requestAnimationFrame(() => {
      gestureFrameRef.current = 0;
      setGesturePreview(gesturePreviewRef.current);
    });
  };

  const clearGesture = () => {
    swipeGestureRef.current.pointerId = null;
    swipeGestureRef.current.signalId = null;
    swipeGestureRef.current.startX = 0;
    swipeGestureRef.current.startY = 0;
    swipeGestureRef.current.dx = 0;
    swipeGestureRef.current.dy = 0;
    swipeGestureRef.current.vx = 0;
    swipeGestureRef.current.vy = 0;
    swipeGestureRef.current.lastX = 0;
    swipeGestureRef.current.lastY = 0;
    swipeGestureRef.current.lastTime = 0;
    swipeGestureRef.current.rotationDirection = 1;
    swipeGestureRef.current.dragging = false;
    pushGesturePreview(createGesturePreview());
  };

  const performQueuedExecution = (signal, nextIntent) => {
    if (normalizedMembershipPlan === 'free') {
      triggerFeedback('soft');
      onOpenMembershipPrompt?.('today_execution', {
        symbol: signal?.symbol,
      });
      return;
    }
    const signalBlocked =
      !signal ||
      !signal._actionable ||
      overall.code === 'WAIT' ||
      overall.code === 'DEFENSE' ||
      overall.code === 'NO_TRADE' ||
      overall.code === 'UNAVAILABLE';
    if (nextIntent?.canOpenBroker) {
      triggerFeedback(signalBlocked ? 'soft' : 'confirm');
      if (!signalBlocked) {
        onCompleteCheckIn?.();
      }
      openTradeIntentHandoff(nextIntent, {
        onBeforeOpen: () => {
          if (!signalBlocked) onPaperExecute?.(signal);
        },
      });
      return;
    }
    if (!signalBlocked) {
      onCompleteCheckIn?.();
      openTradeTicket(signal);
      return;
    }
    triggerFeedback('soft');
    if (overall.code === 'DEFENSE' || overall.code === 'NO_TRADE') {
      onConfirmBoundary?.();
      onAskAi?.('Give me today defense plan in simple actions.');
      return;
    }
    askNovaAboutSignal(signal, nextIntent);
  };

  const markGestureStart = (signalId, clientX, clientY, pointerId = null, cardElement = null) => {
    const bounds = cardElement?.getBoundingClientRect?.() || null;
    const nowMs = Date.now();
    swipeGestureRef.current.pointerId = pointerId;
    swipeGestureRef.current.signalId = signalId;
    swipeGestureRef.current.startX = clientX;
    swipeGestureRef.current.startY = clientY;
    swipeGestureRef.current.dx = 0;
    swipeGestureRef.current.dy = 0;
    swipeGestureRef.current.vx = 0;
    swipeGestureRef.current.vy = 0;
    swipeGestureRef.current.lastX = clientX;
    swipeGestureRef.current.lastY = clientY;
    swipeGestureRef.current.lastTime = nowMs;
    swipeGestureRef.current.rotationDirection =
      bounds && clientY > bounds.top + bounds.height * 0.5 ? -1 : 1;
    swipeGestureRef.current.dragging = false;
    pushGesturePreview({
      signalId,
      dx: 0,
      dy: 0,
      rotate: 0,
      intent: null,
      active: true,
      committed: false,
    });
  };

  const markGestureMove = (signalId, clientX, clientY) => {
    if (swipeGestureRef.current.signalId !== signalId) return;
    const nowMs = Date.now();
    const dt = Math.max(16, nowMs - swipeGestureRef.current.lastTime);
    const dx = clampNumber(clientX - swipeGestureRef.current.startX, -220, 220);
    const dy = clampNumber(clientY - swipeGestureRef.current.startY, -220, 96);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx > 4 || absDy > 4) {
      swipeGestureRef.current.dragging = true;
      swipeGestureRef.current.suppressTapUntil = Date.now() + 320;
    }
    const instantVx = (clientX - swipeGestureRef.current.lastX) / dt;
    const instantVy = (clientY - swipeGestureRef.current.lastY) / dt;
    swipeGestureRef.current.vx = swipeGestureRef.current.vx * 0.58 + instantVx * 0.42;
    swipeGestureRef.current.vy = swipeGestureRef.current.vy * 0.58 + instantVy * 0.42;
    swipeGestureRef.current.lastX = clientX;
    swipeGestureRef.current.lastY = clientY;
    swipeGestureRef.current.lastTime = nowMs;
    swipeGestureRef.current.dx = dx;
    swipeGestureRef.current.dy = dy;
    const rotate = clampNumber(
      dx * 0.055 * swipeGestureRef.current.rotationDirection + dy * 0.015,
      -16,
      16,
    );
    pushGesturePreview({
      signalId,
      dx,
      dy,
      rotate,
      intent: resolveTodayGestureIntent(
        dx,
        dy,
        swipeGestureRef.current.vx,
        swipeGestureRef.current.vy,
      ),
      active: true,
      committed: false,
    });
  };

  const shouldSuppressTap = () =>
    swipeGestureRef.current.dragging || swipeGestureRef.current.suppressTapUntil > Date.now();

  const applyQueueAction = (signal, intent) => {
    if (!signal || !intent) return;
    if (intent === 'accept' && normalizedMembershipPlan === 'free') {
      triggerFeedback('soft');
      onOpenMembershipPrompt?.('today_execution', {
        symbol: signal?.symbol,
      });
      clearGesture();
      return;
    }
    const signalId = signalCardId(signal);
    const exit =
      intent === 'accept'
        ? { dx: 420, dy: 18 }
        : intent === 'later'
          ? { dx: 0, dy: -420 }
          : { dx: -420, dy: 18 };
    triggerFeedback(intent === 'accept' ? 'confirm' : 'soft');
    pushGesturePreview({
      signalId,
      dx: exit.dx,
      dy: exit.dy,
      rotate:
        intent === 'accept'
          ? 14
          : intent === 'skip'
            ? -14
            : clampNumber((swipeGestureRef.current.dx || 0) * 0.035, -8, 8),
      intent,
      active: false,
      committed: true,
    });
    swipeGestureRef.current.suppressTapUntil = Date.now() + 420;
    if (swipeTimerRef.current) {
      window.clearTimeout(swipeTimerRef.current);
    }
    swipeTimerRef.current = window.setTimeout(() => {
      setQueueIds((current) => {
        const remaining = current.filter((id) => id !== signalId);
        if (intent === 'later') {
          return remaining.length ? [...remaining, signalId] : [signalId];
        }
        return remaining;
      });
      if (intent === 'accept') {
        setPendingExecution({
          signal,
          intent: buildSignalIntent(signal),
          actionLabel:
            !signal._actionable || noActionDay
              ? 'Hold'
              : String(signal?.direction || '').toUpperCase() === 'SHORT'
                ? 'Sell'
                : 'Buy',
        });
      }
      clearGesture();
    }, 210);
  };

  const finishGesture = (signal) => {
    const intent = resolveTodayGestureIntent(
      swipeGestureRef.current.dx,
      swipeGestureRef.current.dy,
      swipeGestureRef.current.vx,
      swipeGestureRef.current.vy,
    );
    if (intent) {
      applyQueueAction(signal, intent);
      return;
    }
    clearGesture();
  };

  const openSignalDetail = (signal, signalId) => {
    if (shouldSuppressTap()) return;
    triggerFeedback('soft');
    setActiveSignal(signal);
  };

  const restorePendingExecution = () => {
    if (!pendingExecution?.signal) {
      setPendingExecution(null);
      return;
    }
    const restoreId = signalCardId(pendingExecution.signal);
    triggerFeedback('soft');
    setQueueIds((current) => [restoreId, ...current.filter((id) => id !== restoreId)]);
    setPendingExecution(null);
  };

  if (activeSignal) {
    return (
      <>
        <SignalDetail
          signal={activeSignal}
          locale={locale}
          onBack={() => setActiveSignal(null)}
          onOpenTradeTicket={() => performQueuedExecution(activeSignal, activeSignalIntent)}
          loadingDetails={detailLoading}
          loadError={detailError}
          primaryActionLabel={
            activeSignalIntent?.canOpenBroker
              ? tradeIntentHandoffLabel(activeSignalIntent, locale)
              : locale === 'zh'
                ? '打开交易票据'
                : 'Open trade ticket'
          }
          onAskAi={() => askNovaAboutSignal(activeSignal)}
          onPaperExecute={() => onPaperExecute?.(activeSignal)}
          t={(key, _v, fallback) => fallback || key}
          backLabel={locale === 'zh' ? '今天' : 'Today'}
        />
        <TradeTicketSheet
          open={Boolean(tradeSignal)}
          signal={tradeSignal}
          intent={tradeIntent}
          locale={locale}
          onClose={() => setTradeSignal(null)}
          onAskAi={(signal, intent) => askNovaAboutSignal(signal, intent)}
          onPaperExecute={onPaperExecute}
        />
      </>
    );
  }

  return (
    <section className="stack-gap today-screen-redesign today-screen-native today-tinder-shell">
      <section
        className={`today-summary-header today-summary-header-climate today-summary-tone-${climateVisualTone}`}
      >
        <div className="today-climate-panel">
          <div className="today-summary-copy today-climate-copy today-climate-copy-compact">
            <div className="today-climate-meta-row">
              <p className="today-summary-date">{todayDateLabel}</p>
              <span
                className={`today-climate-status-pill today-climate-status-pill-${climateVisualTone}`}
              >
                {climateStatusLabel}
              </span>
            </div>
            <div className="today-climate-inline">
              <p className="today-climate-label">{locale === 'zh' ? 'Climate 建议' : 'Climate'}</p>
              <p className="today-climate-name">{climate.name}</p>
            </div>
          </div>

          <aside className="today-climate-signal" aria-hidden="true">
            <span
              className={`today-climate-signal-dot today-climate-signal-dot-${climateVisualTone}`}
            />
          </aside>
        </div>
      </section>

      <section className="today-screen-flow today-decision-stack">
        <div
          className="today-deck-shell"
          data-gesture-active={deckGestureActive ? 'true' : 'false'}
          data-gesture-intent={activeSwipeIntent || 'idle'}
        >
          {featuredSignal ? (
            <>
              <div className="today-tinder-deck">
                <article
                  ref={featuredCardRef}
                  className={`glass-card today-action-card today-action-card-swipe today-action-card-${decisionTone} today-action-card-palette-${featuredCardPalette}`}
                  data-gesture-active={
                    gesturePreview.signalId === featuredSignalId && gesturePreview.active
                      ? 'true'
                      : 'false'
                  }
                  data-gesture-intent={
                    gesturePreview.signalId === featuredSignalId
                      ? gesturePreview.intent || 'idle'
                      : 'idle'
                  }
                  data-gesture-committed={
                    gesturePreview.signalId === featuredSignalId && gesturePreview.committed
                      ? 'true'
                      : 'false'
                  }
                  style={{
                    '--gesture-x':
                      gesturePreview.signalId === featuredSignalId
                        ? `${gesturePreview.dx || 0}px`
                        : '0px',
                    '--gesture-y':
                      gesturePreview.signalId === featuredSignalId
                        ? `${gesturePreview.dy || 0}px`
                        : '0px',
                    '--gesture-rotate':
                      gesturePreview.signalId === featuredSignalId
                        ? `${gesturePreview.rotate || 0}deg`
                        : '0deg',
                    '--gesture-skip-strength':
                      gesturePreview.signalId === featuredSignalId ? `${gestureStrengths.skip}` : '0',
                    '--gesture-accept-strength':
                      gesturePreview.signalId === featuredSignalId
                        ? `${gestureStrengths.accept}`
                        : '0',
                    '--gesture-later-strength':
                      gesturePreview.signalId === featuredSignalId ? `${gestureStrengths.later}` : '0',
                  }}
                  onClick={() => openSignalDetail(featuredSignal, featuredSignalId)}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => {
                    if (
                      (event.pointerType === 'mouse' && event.button !== 0) ||
                      isNestedInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    markGestureStart(
                      featuredSignalId,
                      event.clientX,
                      event.clientY,
                      event.pointerId,
                      event.currentTarget,
                    );
                  }}
                  onPointerMove={(event) => {
                    if (swipeGestureRef.current.pointerId !== event.pointerId) return;
                    event.preventDefault();
                    markGestureMove(featuredSignalId, event.clientX, event.clientY);
                  }}
                  onPointerUp={(event) => {
                    if (swipeGestureRef.current.pointerId !== event.pointerId) return;
                    event.preventDefault();
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                    finishGesture(featuredSignal);
                  }}
                  onPointerCancel={(event) => {
                    if (swipeGestureRef.current.pointerId !== event.pointerId) return;
                    event.preventDefault();
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                    clearGesture();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openSignalDetail(featuredSignal, featuredSignalId);
                      return;
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      applyQueueAction(featuredSignal, 'skip');
                      return;
                    }
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      applyQueueAction(featuredSignal, 'accept');
                      return;
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      applyQueueAction(featuredSignal, 'later');
                    }
                  }}
                >
                  <div className="today-swipe-markers" aria-hidden="true">
                    <span className="today-swipe-marker today-swipe-marker-skip">
                      <span className="today-swipe-marker-icon">×</span>
                      <span className="today-swipe-marker-label">
                        {locale === 'zh' ? '不要这张卡' : 'Pass'}
                      </span>
                    </span>
                    <span className="today-swipe-marker today-swipe-marker-later">
                      <span className="today-swipe-marker-icon">↑</span>
                      <span className="today-swipe-marker-label">
                        {locale === 'zh' ? '稍后再看' : 'Later'}
                      </span>
                    </span>
                    <span className="today-swipe-marker today-swipe-marker-accept">
                      <span className="today-swipe-marker-icon">↗</span>
                      <span className="today-swipe-marker-label">
                        {locale === 'zh' ? '去券商下单' : 'Broker'}
                      </span>
                    </span>
                  </div>

                  <div className="today-action-card-head today-action-card-head-showcase">
                    <span className="today-action-kicker">{featuredCardKicker}</span>
                    <span
                      className={`today-action-decision-chip today-action-decision-chip-${decisionTone}`}
                    >
                      {featuredTagLabel}
                    </span>
                  </div>

                  <div className="today-action-main today-action-main-showcase">
                    <div className="today-action-symbol-block today-action-symbol-block-showcase">
                      <h2 className="today-action-symbol">{featuredSignal?.symbol || '--'}</h2>
                      <p className="today-action-direction">{featuredDecisionLabel}</p>
                      <p className="today-action-meta">{featuredMetaLine}</p>
                    </div>
                    <DecisionMark code={noActionDay ? overall.code : 'TRADE'} />
                  </div>

                  <div className="today-action-stats today-action-stats-showcase">
                    <div className="today-action-stat">
                      <span className="today-action-stat-label">
                        {locale === 'zh' ? 'Conviction' : 'Conviction'}
                      </span>
                      <span className="today-action-stat-value">
                        {confidenceText(featuredSignal)}
                      </span>
                    </div>
                    <div className="today-action-stat">
                      <span className="today-action-stat-label">
                        {locale === 'zh' ? 'Size' : 'Size'}
                      </span>
                      <span className="today-action-stat-value">
                        {suggestedPositionText(featuredSignal)}
                      </span>
                    </div>
                    <div className="today-action-stat">
                      <span className="today-action-stat-label">
                        {locale === 'zh' ? 'Risk' : 'Risk'}
                      </span>
                      <span className="today-action-stat-value">{featuredRiskLabel}</span>
                    </div>
                  </div>

                  <div className="today-action-context-row today-action-context-row-showcase">
                    <span className="today-action-context-pill">
                      <span className="today-action-context-label">
                        {locale === 'zh' ? 'Source' : 'Source'}
                      </span>
                      <span className="today-action-context-value">{provenance.label}</span>
                    </span>
                    <span className="today-action-context-pill">
                      <span className="today-action-context-label">
                        {locale === 'zh' ? 'Execution' : 'Execution'}
                      </span>
                      <span className="today-action-context-value">{featuredExecutionLabel}</span>
                    </span>
                    <span className="today-action-context-pill">
                      <span className="today-action-context-label">
                        {locale === 'zh' ? 'Risk gate' : 'Risk gate'}
                      </span>
                      <span className="today-action-context-value">{featuredRiskGateLabel}</span>
                    </span>
                  </div>

                  <div className="today-action-links today-action-links-reference">
                    <button
                      type="button"
                      className="today-action-link today-action-link-primary"
                      data-gesture-ignore="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        performQueuedExecution(featuredSignal, featuredSignalIntent);
                      }}
                    >
                      <span>{featuredPrimaryActionLabel}</span>
                    </button>
                    <button
                      type="button"
                      className="today-action-link today-action-link-secondary"
                      data-gesture-ignore="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        triggerFeedback('soft');
                        askNovaAboutSignal(featuredSignal, featuredSignalIntent);
                      }}
                    >
                      <span>Ask Nova</span>
                    </button>
                  </div>
                </article>
              </div>
            </>
          ) : hiddenDeckCount > 0 ? (
            <article className="glass-card today-action-card today-empty-card">
              <p className="today-action-kicker">{locale === 'zh' ? 'Membership' : 'Membership'}</p>
              <h2 className="today-empty-title">
                {locale === 'zh'
                  ? `解锁剩余 ${hiddenDeckCount} 张 Today 卡片`
                  : `Unlock ${hiddenDeckCount} more Today cards`}
              </h2>
              <p className="today-empty-copy">
                {locale === 'zh'
                  ? `免费版今天先看前 ${todayCardLimit || 3} 张。升级 Lite 继续浏览完整队列，并保留 Keep your broker 路径。`
                  : `Free includes the first ${todayCardLimit || 3} cards. Upgrade to Lite to keep the full queue and broker handoff ready.`}
              </p>
              <div className="today-empty-actions">
                <button
                  type="button"
                  className="today-execution-primary"
                  onClick={() =>
                    onOpenMembershipPrompt?.('today_locked', {
                      freeCardLimit: todayCardLimit || 3,
                      hiddenDeckCount,
                    })
                  }
                >
                  {locale === 'zh' ? '升级 Lite' : 'Start Lite'}
                </button>
                <button
                  type="button"
                  className="today-execution-secondary"
                  onClick={() =>
                    onOpenMembershipPrompt?.('today_locked', {
                      freeCardLimit: todayCardLimit || 3,
                      hiddenDeckCount,
                    })
                  }
                >
                  {locale === 'zh' ? '查看计划' : 'See plans'}
                </button>
              </div>
            </article>
          ) : (
            <article className="glass-card today-action-card today-empty-card">
              <p className="today-action-kicker">
                {locale === 'zh' ? 'Action Card' : 'Action Card'}
              </p>
              <h2 className="today-empty-title">
                {locale === 'zh' ? '当前没有更多标的卡片' : 'No more cards right now'}
              </h2>
              <p className="today-empty-copy">
                {locale === 'zh'
                  ? '这一轮队列已经处理完了。你可以去 Ask Nova 追问，或等待下一次系统快照。'
                  : 'This queue is done for now. Ask Nova for context or wait for the next system snapshot.'}
              </p>
              <div className="today-action-footer today-action-footer-minimal">
                <span className="today-action-powered">Powered by Marvix AI Engine</span>
                <button
                  type="button"
                  className="today-ask-nova-button"
                  data-gesture-ignore="true"
                  onClick={() => {
                    triggerFeedback('soft');
                    onAskAi?.(askPrompt, {
                      page: 'today',
                      focus: 'restraint',
                    });
                  }}
                >
                  <svg viewBox="0 0 20 20" className="today-ask-nova-icon" aria-hidden="true">
                    <path
                      d="M10 2.8 11.85 8.15 17.2 10l-5.35 1.85L10 17.2l-1.85-5.35L2.8 10l5.35-1.85L10 2.8Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Ask Nova</span>
                </button>
              </div>
            </article>
          )}
        </div>
      </section>

      {pendingExecution ? (
        <div className="today-execution-confirm-backdrop" role="presentation">
          <section className="glass-card today-execution-confirm" role="dialog" aria-modal="true">
            <p className="today-execution-confirm-kicker">
              {locale === 'zh' ? 'Keep your broker' : 'Keep your broker'}
            </p>
            <h3 className="today-execution-confirm-title">
              {pendingExecution.actionLabel === 'Hold'
                ? locale === 'zh'
                  ? `Confirm to review ${pendingExecution.signal?.symbol || '--'} in your broker`
                  : `Confirm to review ${pendingExecution.signal?.symbol || '--'} in your broker`
                : `Confirm to execute suggestion for ${pendingExecution.signal?.symbol || '--'}`}
            </h3>
            <p className="today-execution-confirm-copy">Link to your broker.</p>
            <div className="today-execution-confirm-actions">
              <button
                type="button"
                className="today-execution-secondary"
                onClick={restorePendingExecution}
              >
                {locale === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                className="today-execution-primary"
                onClick={() => {
                  const nextIntent =
                    pendingExecution.intent || buildSignalIntent(pendingExecution.signal);
                  const nextSignal = pendingExecution.signal;
                  setPendingExecution(null);
                  performQueuedExecution(nextSignal, nextIntent);
                }}
              >
                {locale === 'zh' ? '确认' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <TradeTicketSheet
        open={Boolean(tradeSignal)}
        signal={tradeSignal}
        intent={tradeIntent}
        locale={locale}
        onClose={() => setTradeSignal(null)}
        onAskAi={(signal, intent) => askNovaAboutSignal(signal, intent)}
        onPaperExecute={onPaperExecute}
      />
    </section>
  );
}

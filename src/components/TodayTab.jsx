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
      label: locale === 'zh' ? '中等' : 'Medium',
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

function executionBoundaryLabel(mode, locale) {
  const zh = locale === 'zh';
  if (mode === 'REALIZED') return zh ? '已成交' : 'Realized';
  if (mode === 'DB_BACKED') return zh ? '数据库快照' : 'DB snapshot';
  if (mode === 'PAPER_ONLY') return zh ? '仅纸面' : 'Paper only';
  if (mode === 'BACKTEST_ONLY') return zh ? '仅回测' : 'Backtest only';
  if (mode === 'DEMO_ONLY') return zh ? '仅演示' : 'Demo only';
  if (mode === 'WITHHELD' || mode === 'INSUFFICIENT_DATA') return zh ? '禁止执行' : 'Do not act';
  return zh ? '模型推导' : 'Model-derived';
}

function riskGuardLabel(overallCode, riskLevelValue, locale) {
  const zh = locale === 'zh';
  if (overallCode === 'UNAVAILABLE') {
    return zh ? '系统未就绪' : 'System unavailable';
  }
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') {
    return zh ? '防守优先' : 'Defense first';
  }
  if (riskLevelValue === 'medium') {
    return zh ? '只做轻仓' : 'Light size only';
  }
  if (riskLevelValue === 'safe') {
    return zh ? '可小仓动作' : 'Small size allowed';
  }
  return zh ? '先别加风险' : 'Do not add risk';
}

function buildKeepInMindText({
  locale,
  signal,
  noActionDay,
  overallCode,
  provenance,
  riskLevelValue,
}) {
  const zh = locale === 'zh';
  if (overallCode === 'UNAVAILABLE') {
    return zh
      ? '当前不是交易判断问题，而是系统运行状态还不够完整。先看数据状态和运行状态，不要凭空下单。'
      : 'This is not a trade-quality issue. The system runtime is not complete enough yet, so check data and runtime status before acting.';
  }
  if (!signal) {
    return zh
      ? '当前没有任何标的通过执行过滤。保持空仓，等下一次更干净的数据快照。'
      : 'No symbol cleared the execution filter. Stay in cash and wait for the next cleaner snapshot.';
  }

  const size = suggestedPositionText(signal);
  const stop = stopLossText(signal);
  const source = provenance?.label || strategySourceText(signal);
  const riskGate = riskGuardLabel(overallCode, riskLevelValue, locale);

  if (noActionDay) {
    return zh
      ? `风险约束仍然是“${riskGate}”。来源是 ${source}，在执行边界放开前不要新增仓位。`
      : `The risk gate stays "${riskGate}." Source quality is ${source}, so do not add exposure before execution clears.`;
  }

  return zh
    ? `仓位上限维持在 ${size}。失效位参考 ${stop === '--' ? '系统未给出' : stop}，不允许放大风险。`
    : `Size stays capped at ${size}. Invalidation sits near ${stop === '--' ? 'the system boundary' : stop}, so do not oversize this trade.`;
}

function buildWhyNowText({ locale, signal, noActionDay, provenance }) {
  const zh = locale === 'zh';
  if (!signal) {
    return zh
      ? '这次没有任何设置通过系统排序和质量过滤，所以今天不给执行卡。'
      : 'No setup survived the system ranking and quality filters, so today does not get an execution card.';
  }

  const symbol = signal.symbol || (zh ? '当前主选' : 'Top setup');
  const conviction = confidenceText(signal);
  const entry = entryRangeText(signal);
  const target = takeProfitText(signal);
  const freshness = generatedText(signal);
  const boundary = executionBoundaryLabel(provenance?.mode, locale);

  if (noActionDay) {
    return zh
      ? `${symbol} 仍是当前最强候选，但执行边界是 ${boundary}。把握 ${conviction}，最近更新 ${freshness}。`
      : `${symbol} is still the top-ranked candidate, but execution remains ${boundary.toLowerCase()}. Conviction is ${conviction}, refreshed ${freshness}.`;
  }

  return zh
    ? `${symbol} 目前排在最前。入场区 ${entry === '--' ? '待确认' : entry}，第一目标 ${target === '--' ? '待确认' : target}，最近更新 ${freshness}。`
    : `${symbol} is the top-ranked setup. Entry sits at ${entry === '--' ? 'pending confirmation' : entry}, first target ${target === '--' ? 'pending confirmation' : target}, refreshed ${freshness}.`;
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
      label: locale === 'zh' ? '中等' : 'Medium',
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
}) {
  // Self-managed clock — keeps App free from 30s re-render cycles
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const [selectedSignalId, setSelectedSignalId] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);
  const [tradeSignal, setTradeSignal] = useState(null);
  const [recentOutcomes, setRecentOutcomes] = useState([]);
  const actionCarouselRef = useRef(null);
  const swipeGestureRef = useRef({
    startX: 0,
    startY: 0,
    dragging: false,
    suppressTapUntil: 0,
  });
  const desiredSignalCount = useMemo(
    () => signalQuotaForTradeMode(brokerProfile?.tradeMode),
    [brokerProfile?.tradeMode],
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
  const carouselSignals = useMemo(() => sortSignalsForDisplay(actionSignals), [actionSignals]);

  useEffect(() => {
    if (!carouselSignals.length) {
      if (selectedSignalId !== null) setSelectedSignalId(null);
      return;
    }
    if (
      !selectedSignalId ||
      !carouselSignals.some((signal) => signalCardId(signal) === selectedSignalId)
    ) {
      setSelectedSignalId(signalCardId(carouselSignals[0]));
    }
  }, [carouselSignals, selectedSignalId]);

  // Fetch recent outcomes
  useEffect(() => {
    let cancelled = false;
    const qs = effectiveUserId
      ? `?userId=${encodeURIComponent(effectiveUserId)}&limit=10`
      : '?limit=10';
    fetch(`/api/outcomes/recent${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.outcomes) {
          setRecentOutcomes(
            data.outcomes.filter((o) => o.verdict !== 'PENDING' && o.symbol).slice(0, 3),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId]);

  const featuredSignal = useMemo(() => {
    if (carouselSignals.length) {
      return (
        carouselSignals.find((signal) => signalCardId(signal) === selectedSignalId) ||
        carouselSignals[0]
      );
    }
    return (
      buildSignalFromDecision(decision, now) ||
      bestSignal ||
      (investorDemoEnabled ? buildDemoFallbackSignal(assetClass, now) : null)
    );
  }, [
    carouselSignals,
    selectedSignalId,
    decision,
    now,
    bestSignal,
    investorDemoEnabled,
    assetClass,
  ]);
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
  const quickTiles = [
    {
      key: 'why',
      label: locale === 'zh' ? '为什么现在看它' : 'Why now',
      value: buildWhyNowText({ locale, signal: featuredSignal, noActionDay, provenance }),
      tone: 'sky',
    },
    {
      key: 'mind',
      label: locale === 'zh' ? '先记住什么' : 'Keep in mind',
      value: buildKeepInMindText({
        locale,
        signal: featuredSignal,
        noActionDay,
        overallCode: overall.code,
        provenance,
        riskLevelValue: risk.level,
      }),
      tone: 'mint',
    },
  ];
  const trustFacts = [
    {
      key: 'source',
      label: locale === 'zh' ? '来源' : 'Source',
      value: provenance.label,
    },
    {
      key: 'execution',
      label: locale === 'zh' ? '执行边界' : 'Execution',
      value: executionBoundaryLabel(provenance.mode, locale),
    },
    {
      key: 'guard',
      label: locale === 'zh' ? '风险约束' : 'Risk gate',
      value: riskGuardLabel(overall.code, risk.level, locale),
    },
  ];
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
  const climateBand = [
    overall.code === 'TRADE'
      ? 'high'
      : overall.code === 'WAIT' || overall.code === 'UNAVAILABLE'
        ? 'mid'
        : 'low',
    noActionDay
      ? 'low'
      : Number(featuredSignal?.position_advice?.position_pct ?? 0) >= 14
        ? 'high'
        : 'mid',
    risk.level === 'safe' ? 'low' : risk.level === 'medium' ? 'mid' : 'high',
  ];
  const actionCardKicker = noActionDay
    ? locale === 'zh'
      ? '今日观察'
      : 'Today watch'
    : locale === 'zh'
      ? '今日主选'
      : 'Today pick';
  const askPrompt = noActionDay
    ? locale === 'zh'
      ? '为什么今天应该先等？'
      : 'Why should I wait today?'
    : locale === 'zh'
      ? '用人话告诉我今天怎么买。'
      : 'Tell me how to take this trade in plain words.';
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

  if (activeSignal) {
    return (
      <>
        <SignalDetail
          signal={activeSignal}
          locale={locale}
          onBack={() => setActiveSignal(null)}
          onOpenTradeTicket={() => handleSignalAction(activeSignal)}
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

  const handleSignalAction = (signal) => {
    const nextIntent = buildSignalIntent(signal);
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
    if (overall.code === 'UNAVAILABLE') {
      onOpenSignals?.();
      return;
    }
    if (overall.code === 'DEFENSE' || overall.code === 'NO_TRADE') {
      onConfirmBoundary?.();
      onAskAi?.('Give me today defense plan in simple actions.');
      return;
    }
    onOpenSignals?.();
  };

  const scrollToCardIndex = (index) => {
    const node = actionCarouselRef.current;
    const targetSignal = carouselSignals[index];
    if (!node || !targetSignal) return;
    const target = node.children[index];
    if (!(target instanceof HTMLElement)) return;
    node.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    setSelectedSignalId(signalCardId(targetSignal));
  };

  const handleCarouselScroll = () => {
    const node = actionCarouselRef.current;
    if (!node || !carouselSignals.length) return;
    const children = Array.from(node.children);
    if (!children.length) return;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    children.forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return;
      const distance = Math.abs(child.offsetLeft - node.scrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const nextSignal = carouselSignals[bestIndex];
    if (nextSignal) {
      const nextId = signalCardId(nextSignal);
      if (nextId !== selectedSignalId) setSelectedSignalId(nextId);
    }
  };

  const markGestureStart = (clientX, clientY) => {
    swipeGestureRef.current.startX = clientX;
    swipeGestureRef.current.startY = clientY;
    swipeGestureRef.current.dragging = false;
  };

  const markGestureMove = (clientX, clientY) => {
    const dx = Math.abs(clientX - swipeGestureRef.current.startX);
    const dy = Math.abs(clientY - swipeGestureRef.current.startY);
    if (dx > 14 && dx > dy) {
      swipeGestureRef.current.dragging = true;
      swipeGestureRef.current.suppressTapUntil = Date.now() + 280;
    }
  };

  const clearGesture = () => {
    swipeGestureRef.current.startX = 0;
    swipeGestureRef.current.startY = 0;
    swipeGestureRef.current.dragging = false;
  };

  const shouldSuppressTap = () =>
    swipeGestureRef.current.dragging || swipeGestureRef.current.suppressTapUntil > Date.now();

  const openSignalDetail = (signal, signalId) => {
    if (shouldSuppressTap()) return;
    triggerFeedback('soft');
    setSelectedSignalId(signalId);
    setActiveSignal(signal);
  };

  return (
    <section className="stack-gap today-screen-redesign today-screen-native">
      <section className="today-summary-header">
        <div className="today-summary-copy">
          <p className="today-summary-date">{todayDateLabel}</p>
          <h1 className="today-summary-title">{locale === 'zh' ? '今日行动' : 'Today'}</h1>
        </div>
      </section>

      <section className="today-screen-flow">
        <article className={`glass-card today-climate-strip today-climate-${climate.tone}`}>
          <div className="today-climate-copy">
            <p className="today-climate-name">{climate.name}</p>
            <p className="today-climate-line">{climate.line}</p>
          </div>
          <div className="today-climate-band" aria-hidden="true">
            {climateBand.map((level, index) => (
              <span
                key={`${level}-${index}`}
                className={`today-climate-pill today-climate-pill-${level}`}
              />
            ))}
          </div>
        </article>

        {carouselSignals.length > 0 ? (
          <section className="today-action-carousel">
            <div
              className="today-action-track"
              ref={actionCarouselRef}
              onScroll={handleCarouselScroll}
            >
              {carouselSignals.map((signal, index) => {
                const signalId = signalCardId(signal);
                const selected = signalId === signalCardId(featuredSignal);
                const signalBlocked =
                  !signal ||
                  !signal._actionable ||
                  overall.code === 'WAIT' ||
                  overall.code === 'DEFENSE' ||
                  overall.code === 'NO_TRADE' ||
                  overall.code === 'UNAVAILABLE';
                const signalDirectionValue = String(signal?.direction || '').toUpperCase();
                const signalTone = !signal?._actionable
                  ? 'wait'
                  : signalDirectionValue === 'SHORT'
                    ? 'defense'
                    : 'trade';
                const signalActionBandLabel = signalBlocked
                  ? overall.code === 'DEFENSE' || signalDirectionValue === 'SHORT'
                    ? locale === 'zh'
                      ? '优先防守'
                      : 'Defense first'
                    : locale === 'zh'
                      ? '先观察'
                      : 'Watch first'
                  : locale === 'zh'
                    ? '可以动作'
                    : 'Actionable';
                const signalDirectionLabel = signalBlocked
                  ? locale === 'zh'
                    ? '先观察'
                    : 'Watch only'
                  : signalDirectionValue === 'SHORT'
                    ? locale === 'zh'
                      ? '偏防守'
                      : 'Reduce risk'
                    : locale === 'zh'
                      ? '可以买入'
                      : 'Buy setup';
                const signalPositionLabel = signalBlocked
                  ? locale === 'zh'
                    ? '先空仓'
                    : 'Stay in cash'
                  : suggestedPositionText(signal);
                const signalRiskLabel =
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
                const signalMetaLine = buildActionMetaText({ locale, signal, provenance });
                const signalIntent = buildSignalIntent(signal);
                const primaryActionLabel = signalIntent?.canOpenBroker
                  ? tradeIntentHandoffLabel(signalIntent, locale)
                  : locale === 'zh'
                    ? '打开交易票据'
                    : 'Open trade ticket';
                return (
                  <article
                    key={signalId}
                    className={`glass-card today-action-card today-action-card-${signalTone} today-action-slide${selected ? ' is-selected' : ''}`}
                    onClick={() => openSignalDetail(signal, signalId)}
                    role="button"
                    tabIndex={0}
                    onTouchStart={(event) => {
                      const touch = event.touches?.[0];
                      if (!touch) return;
                      markGestureStart(touch.clientX, touch.clientY);
                    }}
                    onTouchMove={(event) => {
                      const touch = event.touches?.[0];
                      if (!touch) return;
                      markGestureMove(touch.clientX, touch.clientY);
                    }}
                    onTouchEnd={() => {
                      window.setTimeout(() => {
                        clearGesture();
                      }, 0);
                    }}
                    onTouchCancel={() => {
                      clearGesture();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openSignalDetail(signal, signalId);
                      }
                    }}
                  >
                    <div className="today-action-card-head">
                      <span className="today-action-kicker">
                        {actionCardKicker} {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`today-action-tag today-action-tag-${signalTone}`}>
                        {signalActionBandLabel}
                      </span>
                    </div>

                    <div className="today-action-main">
                      <div className="today-action-symbol-block">
                        <h2 className="today-action-symbol">{signal?.symbol || todayPickSymbol}</h2>
                        <p className="today-action-direction">{signalDirectionLabel}</p>
                        <p className="today-action-meta">{signalMetaLine}</p>
                      </div>
                      <DecisionMark code={signalBlocked ? overall.code : 'TRADE'} />
                    </div>

                    <div className="today-action-stats">
                      <div className="today-action-stat">
                        <span className="today-action-stat-label">
                          {locale === 'zh' ? '把握' : 'Conviction'}
                        </span>
                        <span className="today-action-stat-value">{confidenceText(signal)}</span>
                      </div>
                      <div className="today-action-stat">
                        <span className="today-action-stat-label">
                          {locale === 'zh' ? '仓位' : 'Size'}
                        </span>
                        <span className="today-action-stat-value">{signalPositionLabel}</span>
                      </div>
                      <div className="today-action-stat">
                        <span className="today-action-stat-label">
                          {locale === 'zh' ? '风险' : 'Risk'}
                        </span>
                        <span className="today-action-stat-value">{signalRiskLabel}</span>
                      </div>
                    </div>

                    <div className="today-action-context-row">
                      {trustFacts.map((item) => (
                        <span key={`${signalId}-${item.key}`} className="today-action-context-pill">
                          <span className="today-action-context-label">{item.label}</span>
                          <span className="today-action-context-value">{item.value}</span>
                        </span>
                      ))}
                    </div>

                    <div className="today-action-links">
                      <button
                        type="button"
                        className="today-action-link today-action-link-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSignalAction(signal);
                        }}
                      >
                        {primaryActionLabel}
                      </button>
                      <button
                        type="button"
                        className="today-action-link today-action-link-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          triggerFeedback('soft');
                          if (!signalBlocked) {
                            askNovaAboutSignal(signal);
                            return;
                          }
                          onAskAi?.(askPrompt, {
                            page: 'today',
                            focus: signalBlocked ? 'restraint' : 'top_action',
                          });
                        }}
                      >
                        {locale === 'zh' ? '问 Nova' : 'Ask Nova'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {carouselSignals.length > 1 ? (
              <div
                className="today-action-dots"
                aria-label={locale === 'zh' ? '行动卡位置' : 'Signal position'}
              >
                {carouselSignals.map((signal, index) => {
                  const selected = signalCardId(signal) === signalCardId(featuredSignal);
                  return (
                    <button
                      key={`dot-${signalCardId(signal)}`}
                      type="button"
                      className={`today-action-dot${selected ? ' is-active' : ''}`}
                      aria-label={
                        locale === 'zh' ? `查看第 ${index + 1} 张卡` : `Open card ${index + 1}`
                      }
                      aria-pressed={selected}
                      onClick={() => scrollToCardIndex(index)}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {recentOutcomes.length > 0 ? (
          <section className="today-outcome-ledger">
            <h3 className="today-section-title">
              {locale === 'zh' ? '近期判断回顾' : "Yesterday's Calls"}
            </h3>
            <div className="today-outcome-grid">
              {recentOutcomes.map((outcome) => {
                const verdictIcon =
                  outcome.verdict === 'HIT' ? '✅' : outcome.verdict === 'MISS' ? '❌' : '⬜';
                const returnPct = outcome.verdict_return_pct;
                const returnStr =
                  returnPct !== null && returnPct !== undefined
                    ? `${returnPct >= 0 ? '+' : ''}${(returnPct * 100).toFixed(2)}%`
                    : '--';
                const returnClass = returnPct > 0 ? 'positive' : returnPct < 0 ? 'negative' : '';
                return (
                  <article
                    key={`${outcome.decision_snapshot_id}-${outcome.action_id}`}
                    className="glass-card today-outcome-card"
                  >
                    <div className="today-outcome-head">
                      <span className="today-outcome-verdict">{verdictIcon}</span>
                      <span className="today-outcome-symbol">{outcome.symbol}</span>
                      <span className="today-outcome-direction">
                        {outcome.direction === 'LONG'
                          ? '▲'
                          : outcome.direction === 'SHORT'
                            ? '▼'
                            : '—'}{' '}
                        {outcome.direction}
                      </span>
                    </div>
                    <div className="today-outcome-return">
                      <span className={`today-outcome-pct ${returnClass}`}>{returnStr}</span>
                      <span className="today-outcome-horizon">T+{outcome.verdict_horizon}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="today-summary-grid">
          {quickTiles.map((item) => (
            <article
              key={item.key}
              className={`glass-card today-summary-card today-summary-card-${item.tone}`}
            >
              <p className="today-summary-card-label">{item.label}</p>
              <p className="today-summary-card-value">{item.value}</p>
            </article>
          ))}
        </section>
      </section>

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

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
const DAY_MS = 24 * 60 * 60 * 1000;
const VALIDITY_WARNING_MS = 30 * 60 * 1000;
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

function localeTag(locale) {
  return locale?.startsWith('zh') ? 'zh-CN' : 'en-US';
}

function resolveSignalTimeZone(signal) {
  return String(signal?.market || '').toUpperCase() === 'US' ? 'America/New_York' : 'UTC';
}

function resolveSignalTimeZoneLabel(signal) {
  return String(signal?.market || '').toUpperCase() === 'US' ? 'ET' : 'UTC';
}

function formatDurationClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function marketDateKey(ms, signal) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveSignalTimeZone(signal),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function formatSignalClock(ms, signal, locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: resolveSignalTimeZone(signal),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function formatSignalMonthDay(ms, signal, locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: resolveSignalTimeZone(signal),
    month: locale?.startsWith('zh') ? 'numeric' : 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function formatSignalValidityMoment(ms, signal, locale, nowMs = Date.now()) {
  const timeText = formatSignalClock(ms, signal, locale);
  const zoneLabel = resolveSignalTimeZoneLabel(signal);
  if (marketDateKey(ms, signal) === marketDateKey(nowMs, signal)) {
    return `${timeText} ${zoneLabel}`;
  }
  const dateText = formatSignalMonthDay(ms, signal, locale);
  return locale?.startsWith('zh')
    ? `${dateText} ${timeText} ${zoneLabel}`
    : `${dateText}, ${timeText} ${zoneLabel}`;
}

function formatSignalPrice(value, locale) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  const abs = Math.abs(numeric);
  const maximumFractionDigits = abs >= 1000 || Number.isInteger(numeric) ? 0 : abs >= 100 ? 1 : 2;
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numeric);
}

function resolveSignalValidityMs(signal) {
  const explicitExpiryMs = timestampMs(signal?.valid_until_at || signal?.expires_at);
  if (explicitExpiryMs) return explicitExpiryMs;

  const createdAtMs = timestampMs(signal?.created_at || signal?.generated_at);
  const horizonDays = Number(signal?.time_horizon_days);
  if (createdAtMs && Number.isFinite(horizonDays) && horizonDays > 0) {
    return createdAtMs + horizonDays * DAY_MS;
  }
  const horizonText = String(signal?.time_horizon || '').toLowerCase();
  const rangeMatch = horizonText.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*days?/i);
  if (createdAtMs && rangeMatch) {
    return createdAtMs + Number(rangeMatch[2]) * DAY_MS;
  }
  const singleDayMatch = horizonText.match(/(\d+(?:\.\d+)?)\s*days?/i);
  if (createdAtMs && singleDayMatch) {
    return createdAtMs + Number(singleDayMatch[1]) * DAY_MS;
  }
  if (createdAtMs && /today only|same day|by close/i.test(horizonText)) {
    return createdAtMs + 12 * 60 * 60 * 1000;
  }
  return null;
}

function isUsCloseCutoff(ms, signal) {
  if (String(signal?.market || '').toUpperCase() !== 'US') return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveSignalTimeZone(signal),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  return hour === '16' && minute === '00';
}

function buildSignalInvalidationNote(signal, locale, nowMs = Date.now()) {
  if (!signal) return null;
  const stopPrice = Number(signal?.stop_loss?.price ?? signal?.invalidation_level);
  const stopLabel = Number.isFinite(stopPrice) ? formatSignalPrice(stopPrice, locale) : null;
  const validUntilMs = resolveSignalValidityMs(signal);
  const cutoffLabel = Number.isFinite(validUntilMs)
    ? formatSignalValidityMoment(validUntilMs, signal, locale, nowMs)
    : null;

  let triggerNote = null;
  if (cutoffLabel) {
    if (isUsCloseCutoff(validUntilMs, signal)) {
      triggerNote = locale?.startsWith('zh') ? '收盘前未触发' : 'untriggered by close';
    } else {
      triggerNote = locale?.startsWith('zh')
        ? `未在 ${cutoffLabel} 前触发`
        : `untriggered by ${cutoffLabel}`;
    }
  }

  if (!stopLabel && !triggerNote) return null;
  if (locale?.startsWith('zh')) {
    if (stopLabel && triggerNote) return `若跌破 ${stopLabel} 或 ${triggerNote} 则失效`;
    if (stopLabel) return `若跌破 ${stopLabel} 则失效`;
    return `若${triggerNote}则失效`;
  }
  if (stopLabel && triggerNote) return `Invalid if < ${stopLabel} or ${triggerNote}`;
  if (stopLabel) return `Invalid if < ${stopLabel}`;
  return `Invalid if ${triggerNote}`;
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
const ANALYTICS_CARD_PALETTES = ['blue', 'yellow', 'pink', 'mint', 'violet'];
const ANALYTICS_CARD_VISUALS = ['orb', 'moon', 'wave', 'arc', 'pulse'];

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

function analyticsCardPalette(offset = 0) {
  return ANALYTICS_CARD_PALETTES[offset % ANALYTICS_CARD_PALETTES.length];
}

function analyticsCardThemeStyle(palette) {
  switch (palette) {
    case 'blue':
      return {
        '--today-card-gradient':
          'radial-gradient(circle at 50% 14%, rgba(119, 183, 255, 0.28), transparent 24%), linear-gradient(160deg, #07112e 0%, #0a2a74 52%, #0f65ff 100%)',
        '--today-card-text': '#f9fbff',
        '--today-card-muted': 'rgba(231, 241, 255, 0.8)',
        '--today-card-orb-core': '#73bcff',
        '--today-card-orb-shadow': 'rgba(15, 101, 255, 0.56)',
      };
    case 'yellow':
      return {
        '--today-card-gradient':
          'radial-gradient(circle at 50% 12%, rgba(255, 198, 152, 0.2), transparent 22%), linear-gradient(160deg, #2d1210 0%, #704030 56%, #a56544 100%)',
        '--today-card-text': '#fff8f3',
        '--today-card-muted': 'rgba(255, 232, 217, 0.78)',
        '--today-card-orb-core': '#e8d8cf',
        '--today-card-orb-shadow': 'rgba(121, 88, 76, 0.46)',
      };
    case 'pink':
      return {
        '--today-card-gradient':
          'radial-gradient(circle at 52% 12%, rgba(255, 167, 224, 0.22), transparent 20%), linear-gradient(160deg, #53002d 0%, #a10255 56%, #ff0f7b 100%)',
        '--today-card-text': '#fff9fc',
        '--today-card-muted': 'rgba(255, 229, 242, 0.82)',
        '--today-card-orb-core': '#ff82c1',
        '--today-card-orb-shadow': 'rgba(255, 15, 123, 0.5)',
      };
    case 'mint':
      return {
        '--today-card-gradient':
          'radial-gradient(circle at 50% 12%, rgba(166, 255, 214, 0.18), transparent 22%), linear-gradient(160deg, #0d2922 0%, #1f5347 56%, #2d6b5d 100%)',
        '--today-card-text': '#f6fffb',
        '--today-card-muted': 'rgba(225, 247, 239, 0.8)',
        '--today-card-orb-core': '#9ee7cb',
        '--today-card-orb-shadow': 'rgba(45, 107, 93, 0.44)',
      };
    case 'violet':
    default:
      return {
        '--today-card-gradient':
          'radial-gradient(circle at 50% 12%, rgba(255, 137, 202, 0.16), transparent 20%), linear-gradient(160deg, #4a0027 0%, #85004c 54%, #b10063 100%)',
        '--today-card-text': '#fff8fc',
        '--today-card-muted': 'rgba(255, 227, 241, 0.8)',
        '--today-card-orb-core': '#ff83c5',
        '--today-card-orb-shadow': 'rgba(177, 0, 99, 0.46)',
      };
  }
}

function analyticsCardVisual(offset = 0) {
  return ANALYTICS_CARD_VISUALS[offset % ANALYTICS_CARD_VISUALS.length];
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

function ActionCardValidityPill({ signal, locale }) {
  const validUntilMs = resolveSignalValidityMs(signal);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!validUntilMs || typeof window === 'undefined') return undefined;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [validUntilMs]);

  if (!validUntilMs) return null;

  const remainingMs = validUntilMs - nowMs;
  const expired = remainingMs <= 0;
  const warning = !expired && remainingMs <= VALIDITY_WARNING_MS;
  const state = expired ? 'expired' : warning ? 'warning' : 'live';
  const primaryLabel = expired
    ? locale?.startsWith('zh')
      ? '已失效'
      : 'Expired'
    : `${locale?.startsWith('zh') ? '剩余 ' : 'Valid for '}${formatDurationClock(remainingMs)}`;
  const secondaryLabel = `${locale?.startsWith('zh') ? '截止 ' : 'Until '}${formatSignalValidityMoment(validUntilMs, signal, locale, nowMs)}`;

  return (
    <span
      className={`today-validity-pill today-validity-pill-${state}`}
      aria-live="polite"
      aria-label={`${primaryLabel}. ${secondaryLabel}.`}
    >
      <span className="today-validity-pill-label">{primaryLabel}</span>
      <span className="today-validity-pill-subtitle">{secondaryLabel}</span>
    </span>
  );
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
      expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      generated_at: generatedAt,
      time_horizon: '12 hours',
      time_horizon_days: 0.5,
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
    expires_at: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    generated_at: generatedAt,
    time_horizon: 'same day',
    time_horizon_days: 0.25,
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
    time_horizon: topAction?.time_horizon || signal?.time_horizon || null,
    time_horizon_days: Number.isFinite(
      Number(topAction?.time_horizon_days ?? signal?.time_horizon_days),
    )
      ? Number(topAction?.time_horizon_days ?? signal?.time_horizon_days)
      : null,
    expires_at: signal?.expires_at || topAction?.expires_at || null,
    valid_until_at: signal?.valid_until_at || topAction?.valid_until_at || null,
    portfolio_intent: topAction?.portfolio_intent || null,
    risk_note: topAction?.risk_note || null,
    brief_why_now: topAction?.brief_why_now || null,
    evidence_bundle: topAction?.evidence_bundle || null,
  };
}

function buildSignalsFromDecision(decision, sourceSignals, now) {
  const signalLookup = new Map(
    (Array.isArray(sourceSignals) ? sourceSignals : []).map((row) => [
      String(row?.signal_id || ''),
      row,
    ]),
  );
  return (decision?.ranked_action_cards || [])
    .map((card, index) => {
      const signal = card?.signal_payload;
      if (!signal) return null;
      const sourceSignal =
        signalLookup.get(String(card?.signal_id || signal?.signal_id || '')) || {};
      const dataStatus = normalizeDataStatus({
        ...signal,
        ...sourceSignal,
        data_status: card?.data_status,
        source_status: card?.source_status,
        source_label: card?.source_label,
      });
      return {
        ...sourceSignal,
        ...signal,
        _actionable: Boolean(card?.eligible),
        _dataStatus: dataStatus,
        _freshness:
          signal?.freshness_label || sourceSignal?.freshness_label || freshnessLabel(signal, now),
        strategy_source:
          card?.strategy_source ||
          signal?.strategy_source ||
          sourceSignal?.strategy_source ||
          'AI quant strategy',
        action_label: card?.action_label || null,
        time_horizon: card?.time_horizon || signal?.time_horizon || null,
        time_horizon_days: Number.isFinite(
          Number(card?.time_horizon_days ?? signal?.time_horizon_days),
        )
          ? Number(card?.time_horizon_days ?? signal?.time_horizon_days)
          : null,
        expires_at: signal?.expires_at || sourceSignal?.expires_at || card?.expires_at || null,
        valid_until_at:
          signal?.valid_until_at || sourceSignal?.valid_until_at || card?.valid_until_at || null,
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
  if ((dy <= -68 || (vy < -0.44 && absDy > 16)) && absDy > absDx * 0.98) return 'later';
  if ((absDx >= 60 || (absVx > 0.4 && absDx > 15)) && absDx > Math.max(absDy * 0.98, 16)) {
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
  showUsageGuide = false,
  onCompleteUsageGuide,
}) {
  // Self-managed clock — keeps App free from 30s re-render cycles
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const [activeSignal, setActiveSignal] = useState(null);
  const [activeSignalScreen, setActiveSignalScreen] = useState('preview');
  const [tradeSignal, setTradeSignal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [queueIds, setQueueIds] = useState([]);
  const [queueReady, setQueueReady] = useState(false);
  const [walletIndex, setWalletIndex] = useState(0);
  const [pendingExecution, setPendingExecution] = useState(null);
  const [gesturePreview, setGesturePreview] = useState(createGesturePreview);
  const [previewGesture, setPreviewGesture] = useState(createGesturePreview);
  const [isPreviewClosing, setIsPreviewClosing] = useState(false);
  const [usageGuideStep, setUsageGuideStep] = useState(showUsageGuide ? 'tap' : null);
  const analyticsPaletteBySignalIdRef = useRef(new Map());
  const analyticsPaletteCursorRef = useRef(0);
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
  const walletGestureRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    suppressTapUntil: 0,
    dragging: false,
  });
  const swipeTimerRef = useRef(null);
  const previewGestureRef = useRef({
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
  });
  const previewGestureTimerRef = useRef(null);
  useEffect(() => {
    setUsageGuideStep(showUsageGuide ? 'tap' : null);
  }, [showUsageGuide, effectiveUserId]);
  const previewCloseTimerRef = useRef(null);
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
  const decisionSignals = useMemo(
    () => buildSignalsFromDecision(decision, signals, now),
    [decision, signals, now],
  );
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
  const hiddenDeckCount = Math.max(
    0,
    Number(decision?.membership_gate?.hidden_action_cards || 0) ||
      deckSignals.length - visibleDeckSignals.length,
  );

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
      if (previewGestureTimerRef.current) {
        window.clearTimeout(previewGestureTimerRef.current);
      }
      if (previewCloseTimerRef.current) {
        window.clearTimeout(previewCloseTimerRef.current);
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
  const stackedSignals = useMemo(() => queuedSignals.slice(0, 5), [queuedSignals]);

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
  const featuredMetaLine = actionCardMetaLine(actionMetaText, locale);
  const featuredInvalidationNote = buildSignalInvalidationNote(featuredSignal, locale);
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
          skip: clampNumber(Math.max(0, -(gesturePreview.dx || 0)) / 104, 0, 1),
          accept: clampNumber(Math.max(0, gesturePreview.dx || 0) / 104, 0, 1),
          later: clampNumber(Math.max(0, -(gesturePreview.dy || 0)) / 112, 0, 1),
        }
      : { skip: 0, accept: 0, later: 0 };
  const deckGestureStrength = Math.max(
    gestureStrengths.skip,
    gestureStrengths.accept,
    gestureStrengths.later,
  );
  const climateStatusLabel =
    climateVisualTone === 'safe'
      ? locale === 'zh'
        ? '优秀'
        : 'Excellent'
      : climateVisualTone === 'danger'
        ? locale === 'zh'
          ? '谨慎'
          : 'Caution'
        : locale === 'zh'
          ? '一般'
          : 'Average';
  const previewCards = useMemo(
    () =>
      stackedSignals.slice(1).map((signal, index) => {
        const position = Math.max(
          1,
          deckSignals.findIndex((item) => signalCardId(item) === signalCardId(signal)) + 1,
        );
        const directionLabel = actionCardDecisionLabel(signal, locale);
        const convictionLabel = confidenceText(signal);
        return {
          signal,
          stackIndex: index + 1,
          stackDepth: stackedSignals.length - (index + 1),
          reactivity: Math.max(0.24, 0.78 - (index + 1) * 0.14),
          palette: signalCardPalette(signal, index + 1),
          kicker: actionCardPickLabel(position, locale),
          subtitle:
            convictionLabel !== '--' ? `${directionLabel} · ${convictionLabel}` : directionLabel,
        };
      }),
    [deckSignals, locale, stackedSignals],
  );
  const analyticsCards = useMemo(
    () =>
      queuedSignals.map((signal, index) => {
        const signalId = signalCardId(signal);
        let palette = analyticsPaletteBySignalIdRef.current.get(signalId);
        if (!palette) {
          palette = analyticsCardPalette(analyticsPaletteCursorRef.current);
          analyticsPaletteBySignalIdRef.current.set(signalId, palette);
          analyticsPaletteCursorRef.current += 1;
        }
        const position = Math.max(
          1,
          deckSignals.findIndex((item) => signalCardId(item) === signalId) + 1,
        );
        const directionLabel = actionCardDecisionLabel(signal, locale);
        const convictionLabel = confidenceText(signal);
        return {
          id: signalId,
          signal,
          palette,
          themeStyle: analyticsCardThemeStyle(palette),
          visual: analyticsCardVisual(index),
          kicker: actionCardPickLabel(position, locale),
          chipLabel: actionCardTagLabel(signal, locale),
          tone: signalDecisionTone(signal),
          subtitle:
            convictionLabel !== '--' ? `${directionLabel} · ${convictionLabel}` : directionLabel,
          note: buildSignalInvalidationNote(signal, locale),
        };
      }),
    [deckSignals, locale, queuedSignals],
  );
  const walletCards = useMemo(() => {
    const cards = analyticsCards.map((card) => ({ ...card, kind: 'signal' }));
    if (hiddenDeckCount > 0) {
      cards.push({
        id: 'wallet-lock-card',
        kind: 'lock',
        kicker: locale === 'zh' ? 'Membership' : 'Membership',
        title:
          locale === 'zh'
            ? `解锁剩余 ${hiddenDeckCount} 张卡片`
            : `Unlock ${hiddenDeckCount} more cards`,
        note:
          locale === 'zh'
            ? '升级后可以继续浏览完整队列。'
            : 'Upgrade to keep scrolling the full queue.',
      });
    }
    return cards;
  }, [analyticsCards, hiddenDeckCount, locale]);
  const clampedWalletIndex = Math.min(walletIndex, Math.max(walletCards.length - 1, 0));
  const walletVisibleCards = useMemo(
    () =>
      walletCards.slice(clampedWalletIndex, clampedWalletIndex + 6).map((card, offset) => ({
        ...card,
        actualIndex: clampedWalletIndex + offset,
        stackSlot: offset,
      })),
    [walletCards, clampedWalletIndex],
  );
  const activeSignalQueueIndex = activeSignal
    ? Math.max(
        0,
        queuedSignals.findIndex((signal) => signalCardId(signal) === signalCardId(activeSignal)),
      )
    : 0;
  const activeSignalPosition = activeSignal
    ? Math.max(
        1,
        deckSignals.findIndex((signal) => signalCardId(signal) === signalCardId(activeSignal)) + 1,
      )
    : 1;
  const activeSignalPalette = activeSignal
    ? analyticsPaletteBySignalIdRef.current.get(signalCardId(activeSignal)) ||
      analyticsCardPalette(activeSignalQueueIndex)
    : analyticsCardPalette(activeSignalQueueIndex);
  const activeSignalThemeStyle = analyticsCardThemeStyle(activeSignalPalette);
  const activeSignalVisual = analyticsCardVisual(activeSignalQueueIndex);
  const activeSignalKicker = activeSignal ? actionCardPickLabel(activeSignalPosition, locale) : '';
  const activeSignalChipLabel = activeSignal ? actionCardTagLabel(activeSignal, locale) : '';
  const activeSignalChipTone = activeSignal ? signalDecisionTone(activeSignal) : 'hold';
  const activeSignalSubtitle = activeSignal
    ? (() => {
        const directionLabel = actionCardDecisionLabel(activeSignal, locale);
        const convictionLabel = confidenceText(activeSignal);
        return convictionLabel !== '--' ? `${directionLabel} · ${convictionLabel}` : directionLabel;
      })()
    : '';
  const activeSignalNote = activeSignal ? buildSignalInvalidationNote(activeSignal, locale) : '';
  const activeSignalMetaText = activeSignal
    ? actionCardMetaLine(
        buildActionMetaText({ locale, signal: activeSignal, provenance: null }),
        locale,
      )
    : '';
  const activeSignalRiskText = activeSignal ? actionCardRiskText(activeSignal, locale) : '--';
  const activeSignalSizeText = activeSignal ? suggestedPositionText(activeSignal) : '--';
  const activeSignalSourceText = activeSignal
    ? locale === 'zh'
      ? '数据库实时'
      : 'Database live'
    : '--';
  const activeSignalExecutionText = activeSignal
    ? locale === 'zh'
      ? 'DB snapshot'
      : 'DB snapshot'
    : '--';
  const activeSignalRiskGateText = activeSignal
    ? locale === 'zh'
      ? 'Small size allowed'
      : 'Small size allowed'
    : '--';
  const guideCopy =
    locale === 'zh'
      ? {
          tapTitle: '先点开一张卡',
          tapBody: '先看完整卡片，再决定要不要看更细的详情。',
          tapHint: '点这张卡试试看',
          swipeTitle: '这张完整卡可以直接滑动',
          swipeBody: '左滑跳过，右滑接住，上滑先放一边。想深看就点 Details。',
          swipeBack: '点卡外区域会回到选卡界面',
          done: '知道了',
          skip: '跳过引导',
        }
      : {
          tapTitle: 'Start by opening one card',
          tapBody: 'See the full card first, then decide whether to go deeper.',
          tapHint: 'Tap this card',
          swipeTitle: 'This full card is swipeable',
          swipeBody:
            'Swipe left to pass, right to keep, and up to save for later. Tap Details for the full breakdown.',
          swipeBack: 'Tap outside the card to return to the stack',
          done: 'Got it',
          skip: 'Skip guide',
        };
  const completeUsageGuide = () => {
    setUsageGuideStep(null);
    onCompleteUsageGuide?.();
  };

  useEffect(() => {
    setWalletIndex((current) => Math.min(current, Math.max(walletCards.length - 1, 0)));
  }, [walletCards.length]);

  useEffect(() => {
    if (usageGuideStep === 'tap' && activeSignal && activeSignalScreen === 'preview') {
      setUsageGuideStep('swipe');
    }
  }, [activeSignal, activeSignalScreen, usageGuideStep]);

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
    const horizontalStrength = clampNumber(Math.abs(preview.dx || 0) / 104, 0, 1);
    const verticalStrength = clampNumber(Math.max(0, -(preview.dy || 0)) / 112, 0, 1);
    const gestureProgress = clampNumber(Math.max(horizontalStrength, verticalStrength), 0, 1);
    cardElement.style.setProperty('--gesture-x', `${preview.dx || 0}px`);
    cardElement.style.setProperty('--gesture-y', `${preview.dy || 0}px`);
    cardElement.style.setProperty('--gesture-rotate', `${preview.rotate || 0}deg`);
    cardElement.style.setProperty('--gesture-progress', `${gestureProgress}`);
    cardElement.style.setProperty('--gesture-horizontal-progress', `${horizontalStrength}`);
    cardElement.style.setProperty('--gesture-vertical-progress', `${verticalStrength}`);
    cardElement.style.setProperty(
      '--gesture-skip-strength',
      `${clampNumber(Math.max(0, -(preview.dx || 0)) / 104, 0, 1)}`,
    );
    cardElement.style.setProperty(
      '--gesture-accept-strength',
      `${clampNumber(Math.max(0, preview.dx || 0) / 104, 0, 1)}`,
    );
    cardElement.style.setProperty(
      '--gesture-later-strength',
      `${clampNumber(Math.max(0, -(preview.dy || 0)) / 112, 0, 1)}`,
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
    const rawDx = clampNumber(clientX - swipeGestureRef.current.startX, -260, 260);
    const rawDy = clampNumber(clientY - swipeGestureRef.current.startY, -260, 118);
    const absDx = Math.abs(rawDx);
    const absDy = Math.abs(rawDy);
    if (absDx > 3 || absDy > 3) {
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
    swipeGestureRef.current.dx = rawDx;
    swipeGestureRef.current.dy = rawDy;
    const dx = clampNumber(rawDx * 1.14, -312, 312);
    const dy = clampNumber(rawDy * 1.08, -286, 132);
    const rotate = clampNumber(
      rawDx * 0.074 * swipeGestureRef.current.rotationDirection + rawDy * 0.022,
      -20,
      20,
    );
    pushGesturePreview({
      signalId,
      dx,
      dy,
      rotate,
      intent: resolveTodayGestureIntent(
        rawDx,
        rawDy,
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
        ? { dx: 560, dy: 26 }
        : intent === 'later'
          ? { dx: 0, dy: -540 }
          : { dx: -560, dy: 26 };
    triggerFeedback(intent === 'accept' ? 'confirm' : 'soft');
    pushGesturePreview({
      signalId,
      dx: exit.dx,
      dy: exit.dy,
      rotate:
        intent === 'accept'
          ? 18
          : intent === 'skip'
            ? -18
            : clampNumber((swipeGestureRef.current.dx || 0) * 0.045, -12, 12),
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
    }, 180);
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

  const shouldSuppressWalletTap = () =>
    walletGestureRef.current.dragging || walletGestureRef.current.suppressTapUntil > Date.now();

  const handleWalletStackPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    walletGestureRef.current.pointerId = event.pointerId;
    walletGestureRef.current.startX = event.clientX;
    walletGestureRef.current.startY = event.clientY;
    walletGestureRef.current.lastX = event.clientX;
    walletGestureRef.current.lastY = event.clientY;
    walletGestureRef.current.dragging = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleWalletStackPointerMove = (event) => {
    if (walletGestureRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - walletGestureRef.current.startX;
    const dy = event.clientY - walletGestureRef.current.startY;
    if (Math.abs(dy) > 6 || Math.abs(dx) > 6) {
      walletGestureRef.current.dragging = true;
    }
    walletGestureRef.current.lastX = event.clientX;
    walletGestureRef.current.lastY = event.clientY;
  };

  const finishWalletStackPointer = (event) => {
    if (walletGestureRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - walletGestureRef.current.startX;
    const dy = event.clientY - walletGestureRef.current.startY;
    walletGestureRef.current.pointerId = null;
    if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      walletGestureRef.current.suppressTapUntil = Date.now() + 260;
      setWalletIndex((current) => {
        if (dy < 0) return Math.min(current + 1, Math.max(walletCards.length - 1, 0));
        return Math.max(current - 1, 0);
      });
    }
    walletGestureRef.current.dragging = false;
  };

  const handleWalletCardActivate = (card, index) => {
    if (shouldSuppressWalletTap()) return;
    if (card.kind === 'lock') {
      onOpenMembershipPrompt?.('today_locked', {
        freeCardLimit: todayCardLimit || 3,
        hiddenDeckCount,
      });
      return;
    }
    if (index !== clampedWalletIndex) {
      triggerFeedback('soft');
      setWalletIndex(index);
      return;
    }
    openSignalDetail(card.signal, card.id);
  };

  const openSignalDetail = (signal, signalId) => {
    if (shouldSuppressTap()) return;
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    setIsPreviewClosing(false);
    triggerFeedback('soft');
    setActiveSignal(signal);
    setActiveSignalScreen('preview');
  };

  const finishCloseActiveSignal = () => {
    clearPreviewGesture();
    setIsPreviewClosing(false);
    setActiveSignal(null);
    setActiveSignalScreen('preview');
  };

  const closeActiveSignal = ({ animated = true } = {}) => {
    if (!activeSignal) return;
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    if (animated && activeSignalScreen === 'preview') {
      clearPreviewGesture();
      setIsPreviewClosing(true);
      previewCloseTimerRef.current = window.setTimeout(() => {
        previewCloseTimerRef.current = null;
        finishCloseActiveSignal();
      }, 220);
      return;
    }
    finishCloseActiveSignal();
  };

  const openActiveSignalDetail = () => {
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    setIsPreviewClosing(false);
    setActiveSignalScreen('detail');
    if (usageGuideStep) {
      completeUsageGuide();
    }
  };

  const clearPreviewGesture = () => {
    previewGestureRef.current.pointerId = null;
    previewGestureRef.current.signalId = null;
    previewGestureRef.current.startX = 0;
    previewGestureRef.current.startY = 0;
    previewGestureRef.current.dx = 0;
    previewGestureRef.current.dy = 0;
    previewGestureRef.current.vx = 0;
    previewGestureRef.current.vy = 0;
    previewGestureRef.current.lastX = 0;
    previewGestureRef.current.lastY = 0;
    previewGestureRef.current.lastTime = 0;
    previewGestureRef.current.rotationDirection = 1;
    setPreviewGesture(createGesturePreview());
  };

  const commitPreviewGesture = (intent) => {
    if (!activeSignal || !intent) {
      clearPreviewGesture();
      return;
    }
    const signalId = signalCardId(activeSignal);
    const exit =
      intent === 'accept'
        ? { dx: 560, dy: 24, rotate: 16 }
        : intent === 'later'
          ? {
              dx: 0,
              dy: -520,
              rotate: clampNumber(previewGestureRef.current.dx * 0.04, -10, 10),
            }
          : { dx: -560, dy: 24, rotate: -16 };
    setPreviewGesture({
      signalId,
      dx: exit.dx,
      dy: exit.dy,
      rotate: exit.rotate,
      intent,
      active: false,
      committed: true,
    });
    if (previewGestureTimerRef.current) {
      window.clearTimeout(previewGestureTimerRef.current);
    }
    previewGestureTimerRef.current = window.setTimeout(() => {
      closeActiveSignal({ animated: false });
      applyQueueAction(activeSignal, intent);
      if (usageGuideStep === 'swipe') {
        completeUsageGuide();
      }
      clearPreviewGesture();
    }, 160);
  };

  const startPreviewGesture = (event) => {
    if (
      !activeSignal ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      isNestedInteractiveTarget(event.target, event.currentTarget)
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    previewGestureRef.current.pointerId = event.pointerId;
    previewGestureRef.current.signalId = signalCardId(activeSignal);
    previewGestureRef.current.startX = event.clientX;
    previewGestureRef.current.startY = event.clientY;
    previewGestureRef.current.lastX = event.clientX;
    previewGestureRef.current.lastY = event.clientY;
    previewGestureRef.current.lastTime = Date.now();
    previewGestureRef.current.dx = 0;
    previewGestureRef.current.dy = 0;
    previewGestureRef.current.vx = 0;
    previewGestureRef.current.vy = 0;
    previewGestureRef.current.rotationDirection =
      event.clientY > bounds.top + bounds.height * 0.5 ? -1 : 1;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPreviewGesture({
      signalId: signalCardId(activeSignal),
      dx: 0,
      dy: 0,
      rotate: 0,
      intent: null,
      active: true,
      committed: false,
    });
  };

  const movePreviewGesture = (event) => {
    if (
      !activeSignal ||
      previewGestureRef.current.pointerId !== event.pointerId ||
      previewGestureRef.current.signalId !== signalCardId(activeSignal)
    ) {
      return;
    }
    const nowMs = Date.now();
    const dt = Math.max(16, nowMs - previewGestureRef.current.lastTime);
    const rawDx = clampNumber(event.clientX - previewGestureRef.current.startX, -260, 260);
    const rawDy = clampNumber(event.clientY - previewGestureRef.current.startY, -260, 118);
    const instantVx = (event.clientX - previewGestureRef.current.lastX) / dt;
    const instantVy = (event.clientY - previewGestureRef.current.lastY) / dt;
    previewGestureRef.current.vx = previewGestureRef.current.vx * 0.58 + instantVx * 0.42;
    previewGestureRef.current.vy = previewGestureRef.current.vy * 0.58 + instantVy * 0.42;
    previewGestureRef.current.lastX = event.clientX;
    previewGestureRef.current.lastY = event.clientY;
    previewGestureRef.current.lastTime = nowMs;
    previewGestureRef.current.dx = rawDx;
    previewGestureRef.current.dy = rawDy;
    setPreviewGesture({
      signalId: signalCardId(activeSignal),
      dx: clampNumber(rawDx * 1.08, -312, 312),
      dy: clampNumber(rawDy * 1.04, -286, 132),
      rotate: clampNumber(
        rawDx * 0.068 * previewGestureRef.current.rotationDirection + rawDy * 0.02,
        -18,
        18,
      ),
      intent: resolveTodayGestureIntent(
        rawDx,
        rawDy,
        previewGestureRef.current.vx,
        previewGestureRef.current.vy,
      ),
      active: true,
      committed: false,
    });
  };

  const finishPreviewGesture = () => {
    if (!activeSignal) {
      clearPreviewGesture();
      return;
    }
    const intent = resolveTodayGestureIntent(
      previewGestureRef.current.dx,
      previewGestureRef.current.dy,
      previewGestureRef.current.vx,
      previewGestureRef.current.vy,
    );
    if (intent) {
      commitPreviewGesture(intent);
      return;
    }
    clearPreviewGesture();
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

  const handleActiveSignalSwipe = (intent) => {
    if (!activeSignal || !intent) return;
    closeActiveSignal();
    applyQueueAction(activeSignal, intent);
  };

  if (activeSignal && activeSignalScreen === 'detail') {
    return (
      <>
        <SignalDetail
          signal={activeSignal}
          locale={locale}
          onBack={() => setActiveSignalScreen('preview')}
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
          onSwipeAction={handleActiveSignalSwipe}
          heroKicker={activeSignalKicker}
          heroChipLabel={activeSignalChipLabel}
          heroChipTone={activeSignalChipTone}
          heroPalette={activeSignalPalette}
          heroThemeStyle={activeSignalThemeStyle}
          heroVisual={activeSignalVisual}
          heroValidityPill={<ActionCardValidityPill signal={activeSignal} locale={locale} />}
          heroSubtitle={activeSignalSubtitle}
          heroNote={activeSignalNote}
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

  const isPreviewOpen = Boolean(activeSignal && activeSignalScreen === 'preview');

  const visibleCardCount = Math.max(analyticsCards.length + (hiddenDeckCount > 0 ? 1 : 0), 1);

  return (
    <section
      className={`today-rebuild-shell ${isPreviewOpen ? 'is-preview-open' : ''} ${isPreviewClosing ? 'is-preview-closing' : ''}`}
      style={{
        '--today-rebuild-card-count': `${visibleCardCount}`,
      }}
    >
      <section className={`today-rebuild-header today-rebuild-tone-${climateVisualTone}`}>
        <div className="today-rebuild-climate">
          <p className="today-rebuild-caption">{todayDateLabel}</p>
          <div className="today-rebuild-title-row">
            <h1 className="today-rebuild-title">Climate</h1>
            <span
              className={`today-rebuild-dot today-rebuild-dot-${climateVisualTone}`}
              aria-label={climateStatusLabel}
            />
          </div>
        </div>
      </section>

      <section className="today-rebuild-stack">
        <div className="today-rebuild-deck">
          {analyticsCards.length ? (
            <div className="today-stack-list" role="list" aria-label="Today action cards">
              {walletCards.map((card, index) => (
                <article
                  key={card.id}
                  className={`${card.kind === 'lock' ? 'today-stack-card today-stack-card-lock' : `today-stack-card today-rebuild-card today-rebuild-card-${card.palette}`} ${
                    usageGuideStep === 'tap' && index === 0 && card.kind !== 'lock'
                      ? 'is-usage-guide-target'
                      : ''
                  }`}
                  data-visual={card.visual}
                  style={{
                    '--stack-index': `${index}`,
                    '--stack-z': `${index + 1}`,
                    ...(card.themeStyle || {}),
                  }}
                  onClick={() => {
                    if (card.kind === 'lock') {
                      onOpenMembershipPrompt?.('today_locked', {
                        freeCardLimit: todayCardLimit || 3,
                        hiddenDeckCount,
                      });
                      return;
                    }
                    openSignalDetail(card.signal, card.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (card.kind === 'lock') {
                        onOpenMembershipPrompt?.('today_locked', {
                          freeCardLimit: todayCardLimit || 3,
                          hiddenDeckCount,
                        });
                        return;
                      }
                      openSignalDetail(card.signal, card.id);
                    }
                  }}
                >
                  {card.kind === 'lock' ? (
                    <>
                      <p className="today-rebuild-card-kicker">{card.kicker}</p>
                      <h2 className="today-rebuild-card-title">{card.title}</h2>
                      <div className="today-rebuild-card-footer">
                        <p className="today-rebuild-card-note">{card.note}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="today-rebuild-card-head">
                        <div className="today-rebuild-card-copy">
                          <p className="today-rebuild-card-kicker">{card.kicker}</p>
                          <h2 className="today-rebuild-card-title">
                            {card.signal?.symbol || '--'}
                          </h2>
                        </div>
                        <div className="today-rebuild-card-pills">
                          <span
                            className={`today-rebuild-card-chip today-rebuild-card-chip-${card.tone}`}
                          >
                            {card.chipLabel}
                          </span>
                          <ActionCardValidityPill signal={card.signal} locale={locale} />
                        </div>
                      </div>

                      <div className="today-rebuild-art" aria-hidden="true">
                        <span className="today-rebuild-art-ring" />
                        <span className="today-rebuild-art-orb" />
                        <span className="today-rebuild-art-trace" />
                      </div>

                      <div className="today-rebuild-card-footer">
                        <p className="today-rebuild-card-subtitle">{card.subtitle}</p>
                        {card.note ? <p className="today-rebuild-card-note">{card.note}</p> : null}
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : hiddenDeckCount > 0 ? (
            <article className="today-rebuild-empty">
              <p className="today-rebuild-card-kicker">
                {locale === 'zh' ? 'Membership' : 'Membership'}
              </p>
              <h2 className="today-rebuild-empty-title">
                {locale === 'zh'
                  ? `解锁剩余 ${hiddenDeckCount} 张 Today 卡片`
                  : `Unlock ${hiddenDeckCount} more Today cards`}
              </h2>
              <p className="today-rebuild-empty-copy">
                {locale === 'zh'
                  ? `免费版今天先看前 ${todayCardLimit || 3} 张。升级 Lite 继续浏览完整队列，并保留 Keep your broker 路径。`
                  : `Free includes the first ${todayCardLimit || 3} cards. Upgrade to Lite to keep the full queue and broker handoff ready.`}
              </p>
              <div className="today-rebuild-empty-actions">
                <button
                  type="button"
                  className="today-rebuild-lock-cta"
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
                  className="today-rebuild-ghost-cta"
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
            <article className="today-rebuild-empty">
              <p className="today-rebuild-card-kicker">
                {locale === 'zh' ? 'Action Card' : 'Action Card'}
              </p>
              <h2 className="today-rebuild-empty-title">
                {locale === 'zh' ? '当前没有更多标的卡片' : 'No more cards right now'}
              </h2>
              <p className="today-rebuild-empty-copy">
                {locale === 'zh'
                  ? '这一轮队列已经处理完了。你可以去 Ask Nova 追问，或等待下一次系统快照。'
                  : 'This queue is done for now. Ask Nova for context or wait for the next system snapshot.'}
              </p>
              <div className="today-rebuild-empty-actions">
                <button
                  type="button"
                  className="today-rebuild-lock-cta"
                  data-gesture-ignore="true"
                  onClick={() => {
                    triggerFeedback('soft');
                    onAskAi?.(askPrompt, {
                      page: 'today',
                      focus: 'restraint',
                    });
                  }}
                >
                  <span>Ask Nova</span>
                </button>
              </div>
            </article>
          )}
        </div>
      </section>

      {usageGuideStep === 'tap' && !isPreviewOpen ? (
        <div className="today-usage-guide today-usage-guide-stack">
          <div className="today-usage-guide-panel" data-gesture-ignore="true">
            <p className="today-usage-guide-kicker">{guideCopy.tapHint}</p>
            <h3 className="today-usage-guide-title">{guideCopy.tapTitle}</h3>
            <p className="today-usage-guide-copy">{guideCopy.tapBody}</p>
            <button type="button" className="today-usage-guide-skip" onClick={completeUsageGuide}>
              {guideCopy.skip}
            </button>
          </div>
        </div>
      ) : null}

      {isPreviewOpen ? (
        <section className="today-preview-overlay">
          <button
            type="button"
            className="today-preview-backdrop"
            aria-label={locale === 'zh' ? '关闭卡片预览' : 'Close card preview'}
            onClick={closeActiveSignal}
          />

          <div className="today-preview-shell" onClick={closeActiveSignal}>
            <article
              className={`today-preview-card today-rebuild-card today-rebuild-card-${activeSignalPalette}`}
              data-visual={activeSignalVisual}
              data-closing={isPreviewClosing ? 'true' : 'false'}
              data-gesture-active={previewGesture.active ? 'true' : 'false'}
              data-gesture-intent={previewGesture.intent || 'idle'}
              data-gesture-committed={previewGesture.committed ? 'true' : 'false'}
              style={{
                '--gesture-x': `${previewGesture.dx || 0}px`,
                '--gesture-y': `${previewGesture.dy || 0}px`,
                '--gesture-rotate': `${previewGesture.rotate || 0}deg`,
                ...(activeSignalThemeStyle || {}),
              }}
              onPointerDown={startPreviewGesture}
              onPointerMove={movePreviewGesture}
              onPointerUp={finishPreviewGesture}
              onPointerCancel={clearPreviewGesture}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="today-preview-card-head">
                <span className="today-preview-kicker">{activeSignalKicker}</span>
                <div className="today-preview-head-pills">
                  <span
                    className={`today-rebuild-card-chip today-rebuild-card-chip-${activeSignalChipTone}`}
                  >
                    {activeSignalChipLabel}
                  </span>
                  <ActionCardValidityPill signal={activeSignal} locale={locale} />
                </div>
              </div>

              <div className="today-preview-main">
                <div className="today-preview-copy">
                  <h2 className="today-preview-symbol">{activeSignal.symbol || '--'}</h2>
                  <p className="today-preview-direction">{activeSignalSubtitle}</p>
                  <p className="today-preview-meta">{activeSignalMetaText}</p>
                </div>

                <div className="today-preview-art today-rebuild-art" aria-hidden="true">
                  <span className="today-rebuild-art-ring" />
                  <span className="today-rebuild-art-orb" />
                  <span className="today-rebuild-art-trace" />
                </div>

                <div className="today-preview-metrics">
                  <div className="today-preview-metric">
                    <span className="today-preview-metric-label">
                      {locale === 'zh' ? 'Conviction' : 'Conviction'}
                    </span>
                    <span className="today-preview-metric-value">
                      {confidenceText(activeSignal)}
                    </span>
                  </div>
                  <div className="today-preview-metric">
                    <span className="today-preview-metric-label">
                      {locale === 'zh' ? 'Size' : 'Size'}
                    </span>
                    <span className="today-preview-metric-value">{activeSignalSizeText}</span>
                  </div>
                  <div className="today-preview-metric">
                    <span className="today-preview-metric-label">
                      {locale === 'zh' ? 'Risk' : 'Risk'}
                    </span>
                    <span className="today-preview-metric-value">{activeSignalRiskText}</span>
                  </div>
                </div>

                <div className="today-preview-tags">
                  <span className="today-preview-tag">
                    <span className="today-preview-tag-label">
                      {locale === 'zh' ? 'Source' : 'Source'}
                    </span>
                    <span className="today-preview-tag-value">{activeSignalSourceText}</span>
                  </span>
                  <span className="today-preview-tag">
                    <span className="today-preview-tag-label">
                      {locale === 'zh' ? 'Execution' : 'Execution'}
                    </span>
                    <span className="today-preview-tag-value">{activeSignalExecutionText}</span>
                  </span>
                  <span className="today-preview-tag">
                    <span className="today-preview-tag-label">
                      {locale === 'zh' ? 'Risk Gate' : 'Risk Gate'}
                    </span>
                    <span className="today-preview-tag-value">{activeSignalRiskGateText}</span>
                  </span>
                </div>
              </div>
              {activeSignalNote ? <p className="today-preview-note">{activeSignalNote}</p> : null}

              <div className="today-preview-actions">
                <button
                  type="button"
                  className="today-rebuild-lock-cta"
                  onClick={openActiveSignalDetail}
                  data-gesture-ignore="true"
                >
                  {locale === 'zh' ? 'Details' : 'Details'}
                </button>
                <button
                  type="button"
                  className="today-rebuild-ghost-cta"
                  onClick={() => askNovaAboutSignal(activeSignal)}
                  data-gesture-ignore="true"
                >
                  {locale === 'zh' ? 'Ask Nova' : 'Ask Nova'}
                </button>
              </div>

              {usageGuideStep === 'swipe' ? (
                <div
                  className="today-usage-guide today-usage-guide-preview"
                  data-gesture-ignore="true"
                >
                  <div className="today-usage-guide-panel">
                    <p className="today-usage-guide-kicker">{guideCopy.swipeBack}</p>
                    <h3 className="today-usage-guide-title">{guideCopy.swipeTitle}</h3>
                    <p className="today-usage-guide-copy">{guideCopy.swipeBody}</p>
                    <div className="today-usage-guide-gestures">
                      <span>← {locale === 'zh' ? '跳过' : 'Pass'}</span>
                      <span>↑ {locale === 'zh' ? '稍后' : 'Later'}</span>
                      <span>→ {locale === 'zh' ? '接住' : 'Keep'}</span>
                    </div>
                    <button
                      type="button"
                      className="today-usage-guide-done"
                      onClick={completeUsageGuide}
                    >
                      {guideCopy.done}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          </div>
        </section>
      ) : null}

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

import { useMemo, useState } from 'react';
import SignalDetail from './SignalDetail';

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

function suggestionSubtitle(bestSignal) {
  if (!bestSignal) return 'No clear setup yet. Wait for cleaner conditions.';
  if (!bestSignal._actionable) return 'Signal exists, but not actionable right now.';
  if (bestSignal.direction === 'SHORT') return 'Risk is elevated. Keep position small and strict.';
  return 'Low risk today, small position allowed.';
}

function deriveOverallStatus(args) {
  const { today, safety, runtime, bestSignal } = args;
  const mode = String(safety?.mode || '').toLowerCase();
  const runtimeStatus = String(runtime?.source_status || '').toUpperCase();
  if (today?.is_trading_day === false) {
    return {
      code: 'NO_TRADE',
      headline: '❌ Not suitable to trade',
      subtitle: 'Market is closed. Focus on review only.'
    };
  }
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return {
      code: 'DEFENSE',
      headline: '🛡 Defense mode (market risk high)',
      subtitle: safety?.primary_risks?.[0] || 'Risk pressure is high. Capital protection first.'
    };
  }
  if (runtimeStatus === 'INSUFFICIENT_DATA' || runtimeStatus === 'WITHHELD') {
    return {
      code: 'WAIT',
      headline: '⚠️ Better to wait',
      subtitle: 'Data quality is limited. Wait for better signal clarity.'
    };
  }
  if (!bestSignal) {
    return {
      code: 'WAIT',
      headline: '⚠️ Better to wait',
      subtitle: 'No high-quality opportunity at the moment.'
    };
  }
  if (!bestSignal._actionable) {
    return {
      code: 'WAIT',
      headline: '⚠️ Better to wait',
      subtitle: bestSignal._dataStatus === 'WITHHELD' ? 'Signal is withheld due to low sample quality.' : 'Signal is not ready for execution.'
    };
  }
  if (String(bestSignal?.regime_id || '').toUpperCase() === 'RISK_OFF') {
    return {
      code: 'DEFENSE',
      headline: '🛡 Defense mode (market risk high)',
      subtitle: 'Market risk remains high. Only small defensive actions.'
    };
  }
  return {
    code: 'TRADE',
    headline: '✅ Can trade today',
    subtitle: suggestionSubtitle(bestSignal)
  };
}

function riskLevel(overallCode, bestSignal) {
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') {
    return {
      level: 'danger',
      icon: '🔴',
      label: 'Dangerous',
      explanation: 'High risk environment. Do not force trades.'
    };
  }
  if (!bestSignal || !bestSignal._actionable || ['EXPERIMENTAL', 'WITHHELD', 'INSUFFICIENT_DATA'].includes(bestSignal._dataStatus)) {
    return {
      level: 'medium',
      icon: '🟡',
      label: 'Medium',
      explanation: 'Conditions are mixed. Keep risk low and be selective.'
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: 'Safe',
    explanation: 'Setup quality is acceptable. Small position only.'
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

function mainButtonLabel(overallCode) {
  if (overallCode === 'TRADE') return 'Follow Strategy';
  if (overallCode === 'DEFENSE' || overallCode === 'NO_TRADE') return 'View Defense Plan';
  return 'Wait for Next Opportunity';
}

function sourceCaption(signal, investorDemoEnabled) {
  if (!signal) return null;
  if (signal._dataStatus === 'DEMO_ONLY') {
    return 'Source: DEMO_ONLY fallback signal for investor walkthrough.';
  }
  if (investorDemoEnabled) {
    return 'Source: live signal path is still being used while demo holdings are on.';
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

function overallFromDecision(decision) {
  const call = decision?.today_call;
  if (!call) return null;
  return {
    code: call?.code || 'WAIT',
    headline: call?.headline || call?.summary || '⚠️ Better to wait',
    subtitle: call?.subtitle || decision?.risk_state?.user_message || 'Decision snapshot available.'
  };
}

function riskFromDecision(decision) {
  const posture = String(decision?.risk_state?.posture || '').toUpperCase();
  if (!posture) return null;
  if (posture === 'DEFEND' || posture === 'WAIT') {
    return {
      level: 'danger',
      icon: '🔴',
      label: 'Dangerous',
      explanation: decision?.risk_state?.user_message || 'High risk environment. Do not force trades.'
    };
  }
  if (posture === 'PROBE') {
    return {
      level: 'medium',
      icon: '🟡',
      label: 'Medium',
      explanation: decision?.risk_state?.user_message || 'Conditions are mixed. Keep risk low and selective.'
    };
  }
  return {
    level: 'safe',
    icon: '🟢',
    label: 'Safe',
    explanation: decision?.risk_state?.user_message || 'Conditions allow selective action.'
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
    overallFromDecision(decision) ||
    deriveOverallStatus({
      today,
      safety,
      runtime,
      bestSignal: featuredSignal
    });

  const risk = riskFromDecision(decision) || riskLevel(overall.code, featuredSignal);
  const buttonText = mainButtonLabel(overall.code);
  const morningCheck = engagement?.daily_check_state || null;
  const wrapUp = engagement?.daily_wrap_up || null;
  const uiRegime = engagement?.ui_regime_state || null;
  const recommendationChange = engagement?.recommendation_change || null;
  const noActionDay = !featuredSignal || !featuredSignal._actionable || overall.code === 'WAIT' || overall.code === 'DEFENSE' || overall.code === 'NO_TRADE';
  const actionCardLead = noActionDay
    ? uiRegime?.protective_line || morningCheck?.arrival_line || '今天的重点不是找动作，而是把边界看清。'
    : morningCheck?.arrival_line || uiRegime?.arrival_line || '今天的结论已经到了，先确认，再动手。';
  const actionCardSubline = recommendationChange?.changed
    ? recommendationChange.summary
    : noActionDay
      ? morningCheck?.ritual_line || uiRegime?.ritual_line || '今天先看清，比急着表态更值钱。'
      : featuredSignal?.brief_why_now || morningCheck?.ritual_line || '这张卡排第一，不代表今天要放大动作。';
  const actionStateBadges = [
    featuredSignal ? { key: 'rank', label: 'Rank #1', tone: 'badge-neutral' } : null,
    recommendationChange?.changed ? { key: 'change', label: 'Updated', tone: 'badge-medium' } : null,
    morningCheck?.status === 'COMPLETED' ? { key: 'checked', label: 'Checked', tone: 'badge-triggered' } : null,
    noActionDay ? { key: 'restraint', label: 'No rush', tone: 'badge-neutral' } : null
  ].filter(Boolean);

  if (activeSignal) {
    return <SignalDetail signal={activeSignal} onBack={() => setActiveSignal(null)} t={(key, _v, fallback) => fallback || key} />;
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
          className={`glass-card beginner-best-suggestion today-action-card-compact ritual-card ritual-reveal ritual-delay-1 ${noActionDay ? 'is-no-action-day' : 'is-action-day'} ${
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
          <div className="card-header today-action-header">
            <div>
              <h3 className="card-title">Today&apos;s Best Action</h3>
              <p className="muted">{actionCardLead}</p>
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
          <p className="ritual-kicker">{actionCardSubline}</p>
          {!featuredSignal ? (
            <p className="muted status-line">
              {uiRegime?.completion_line || 'No high-quality opportunity now. Waiting is the cleanest action on the board.'}
            </p>
          ) : (
            <>
              <p className="today-action-line">
                {featuredSignal.symbol || '--'} · {featuredSignal._actionable ? String(signalDirection(featuredSignal)).toUpperCase() : 'WAIT'}
              </p>
              <p className="muted status-line">
                {featuredSignal.brief_why_now ||
                  (noActionDay
                    ? uiRegime?.humor_line || '市场给了波动，但没给出需要你立刻处理的确定性。'
                    : '这张卡现在最值得看，但不值得你失去纪律。')}
              </p>
              <div className="today-action-grid">
                <div className="status-box">
                  <p className="muted">Buy Zone</p>
                  <h2>{entryRangeText(featuredSignal)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Size</p>
                  <h2>{suggestedPositionText(featuredSignal)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Take profit</p>
                  <h2>{takeProfitText(featuredSignal)}</h2>
                </div>
                <div className="status-box">
                  <p className="muted">Stop loss</p>
                  <h2>{stopLossText(featuredSignal)}</h2>
                </div>
              </div>
              <p className="muted status-line">
                {strategySourceText(featuredSignal)} · {generatedText(featuredSignal)}
                {featuredSignal?.portfolio_intent ? ` · ${String(featuredSignal.portfolio_intent).replace(/_/g, ' ')}` : ''}
              </p>
              <p className="muted status-line">
                {featuredSignal?.risk_note ||
                  (noActionDay
                    ? morningCheck?.completion_feedback || uiRegime?.protective_line || '今天系统更重视边界，而不是新风险。'
                    : uiRegime?.humor_line || '可以看，但别把一点把握误读成全场明牌。')}
              </p>
              <div className="action-row today-action-row">
                <button
                  type="button"
                  className="primary-btn today-action-cta"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMainAction();
                  }}
                >
                  {featuredSignal._actionable ? 'Take Action' : buttonText}
                </button>
              </div>
              <p className="muted status-line action-card-footnote">
                {morningCheck?.status === 'COMPLETED'
                  ? morningCheck.completion_feedback
                  : noActionDay
                    ? uiRegime?.completion_line || '今天最重要的动作，可能已经在你没有追出去的时候完成了。'
                    : morningCheck?.ritual_line || '先确认，再决定要不要把风险放大。'}
              </p>
            </>
          )}
        </article>

        <div className="today-status-grid ritual-delay-2">
          <article className={`glass-card beginner-today-overall today-compact-info-card state-card state-card-${uiRegime?.tone || 'quiet'}`}>
            <h3 className="card-title">{overall.headline}</h3>
            <p className="muted status-line">{overall.subtitle}</p>
            {uiRegime?.arrival_line ? <p className="ritual-kicker">{uiRegime.arrival_line}</p> : null}
          </article>

          <article className={`glass-card beginner-risk-card today-compact-info-card state-card state-card-${uiRegime?.tone || 'quiet'}`}>
            <h3 className="card-title">Risk</h3>
            <div className="simple-risk-track" aria-label={`Risk level ${risk.label}`}>
              <div className={`simple-risk-fill simple-risk-${risk.level}`} />
            </div>
            <p className="status-line">
              {risk.icon} {risk.label}
            </p>
            <p className="muted status-line">{risk.explanation}</p>
            {uiRegime?.ritual_line ? <p className="ritual-kicker">{uiRegime.ritual_line}</p> : null}
          </article>
        </div>

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
              <h3 className="card-title">{secondaryDecisionSignals.length ? 'More Ranked Actions' : 'Recent Signals'}</h3>
              <p className="muted">
                {secondaryDecisionSignals.length ? 'Lower-priority actions after the top decision.' : 'Recent examples for demo walkthroughs.'}
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
              Open Wrap-Up
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                triggerFeedback('soft');
                onAskAi?.('What mattered most today?', { page: 'today', focus: 'wrap_up' });
              }}
            >
              Ask Nova
            </button>
          </div>
          {wrapUp.completion_feedback ? <p className="muted status-line">{wrapUp.completion_feedback}</p> : null}
        </article>
      ) : null}
    </section>
  );
}

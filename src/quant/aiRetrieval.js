const ACTIVE_SIGNAL_STATUS = new Set(['NEW', 'TRIGGERED']);

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(safeNumber(value) * p) / p;
}

function normalizeDataStatus(input) {
  return String(
    input?.data_status ||
      input?.source_label ||
      input?.source_status ||
      input?.source_transparency?.data_status ||
      input?.source_transparency?.source_label ||
      input?.source_transparency?.source_status ||
      'INSUFFICIENT_DATA'
  )
    .trim()
    .toUpperCase();
}

function parseTimestamp(value) {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : null;
}

function freshnessLabel(signal) {
  const ts = parseTimestamp(signal?.created_at || signal?.generated_at);
  if (!ts) return 'unknown';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function directionLabel(signal) {
  const direction = String(signal?.direction || '').toUpperCase();
  if (direction === 'LONG') return 'Buy';
  if (direction === 'SHORT') return 'Sell';
  return 'Wait';
}

function isActionable(signal) {
  const status = String(signal?.status || '').toUpperCase();
  const dataStatus = normalizeDataStatus(signal);
  return ACTIVE_SIGNAL_STATUS.has(status) && !['WITHHELD', 'INSUFFICIENT_DATA'].includes(dataStatus);
}

function signalScore(signal) {
  const freshnessPenalty = (() => {
    const ts = parseTimestamp(signal?.created_at || signal?.generated_at);
    if (!ts) return 24;
    const ageHours = Math.max(0, (Date.now() - ts) / 3600000);
    return Math.min(24, ageHours);
  })();
  const conviction = safeNumber(signal?.confidence ?? signal?.conviction, 0);
  const quality = safeNumber(signal?.score, conviction * 100);
  const statusPenalty = isActionable(signal) ? 0 : 18;
  const dataPenalty = ['DB_BACKED', 'MODEL_DERIVED'].includes(normalizeDataStatus(signal)) ? 0 : 22;
  return quality + conviction * 30 - freshnessPenalty - statusPenalty - dataPenalty;
}

function pickTopSignal(state, ticker) {
  const evidenceSignals = Array.isArray(state?.evidence?.top_signals) ? state.evidence.top_signals : [];
  const runtimeSignals = Array.isArray(state?.signals) ? state.signals : [];
  const all = [...runtimeSignals, ...evidenceSignals];
  const normalized = all
    .map((row) => ({
      ...row,
      confidence: safeNumber(row?.confidence ?? row?.conviction, 0),
      data_status: normalizeDataStatus(row)
    }))
    .filter((row) => row.symbol);

  if (ticker) {
    const upper = ticker.toUpperCase();
    const matched = normalized.find((row) => String(row.symbol || '').toUpperCase() === upper);
    if (matched) return matched;
  }

  return normalized.sort((a, b) => signalScore(b) - signalScore(a))[0] || null;
}

function pickHoldingsReview(state) {
  return state?.user_context?.holdings_review || null;
}

function marketMood(state) {
  const mode = String(state?.safety?.mode || '').toLowerCase();
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return 'Defense mode';
  }
  if (mode.includes('trade light')) {
    return 'Careful mode';
  }
  if (pickTopSignal(state)) {
    return 'Trade allowed';
  }
  return 'Wait';
}

function riskLevel(state) {
  const mode = String(state?.safety?.mode || '').toLowerCase();
  if (mode.includes('do not trade') || mode.includes('defense')) {
    return { label: 'Dangerous', note: 'The market is jumpy. Protect cash first.' };
  }
  if (mode.includes('trade light')) {
    return { label: 'Medium', note: 'Small size only. Do not chase.' };
  }
  return { label: 'Safe', note: 'Only if the setup is clean, and still keep it small.' };
}

function parseSignalTags(signal) {
  const tags = Array.isArray(signal?.tags) ? signal.tags.map((row) => String(row)) : [];
  const topFactors = tags
    .filter((tag) => tag.startsWith('factor:'))
    .map((tag) => tag.replace('factor:', '').replace(/_/g, ' '))
    .slice(0, 3);
  const adaptiveRisk = tags.find((tag) => tag.startsWith('auto_risk:'));
  const adaptivePosition = tags.find((tag) => tag.startsWith('auto_position:'));
  const learning = tags.find((tag) => tag.startsWith('auto_learning:'));
  return {
    topFactors,
    adaptiveRisk: adaptiveRisk ? safeNumber(adaptiveRisk.split(':')[1], null) : null,
    adaptivePosition: adaptivePosition ? safeNumber(adaptivePosition.split(':')[1], null) : null,
    learningEnabled: learning ? learning.endsWith('enabled') : null
  };
}

function positionText(signal) {
  const tagMeta = parseSignalTags(signal);
  const advisedPct = safeNumber(signal?.position_advice?.position_pct, null);
  if (Number.isFinite(advisedPct) && advisedPct > 0) {
    return `${Math.min(20, round(advisedPct, 0))}%`;
  }
  if (Number.isFinite(tagMeta.adaptivePosition)) {
    return `${Math.min(20, round(tagMeta.adaptivePosition * 100, 0))}%`;
  }
  return '10%';
}

function stopText(signal) {
  const stop = signal?.stop_loss?.price ?? signal?.invalidation_level;
  return Number.isFinite(Number(stop)) ? round(stop, 2) : null;
}

function targetText(signal) {
  const target = signal?.take_profit_levels?.[0]?.price ?? signal?.take_profit;
  return Number.isFinite(Number(target)) ? round(target, 2) : null;
}

function sourceNote(state, signal) {
  const signalStatus = signal ? normalizeDataStatus(signal) : null;
  const runtimeStatus = normalizeDataStatus(state?.config?.runtime);
  const dataStatus =
    signalStatus && signalStatus !== 'INSUFFICIENT_DATA' ? signalStatus : runtimeStatus;
  if (dataStatus === 'DB_BACKED') return 'Using the live database path.';
  if (dataStatus === 'MODEL_DERIVED') return 'Using a model result built from recent market data.';
  if (dataStatus === 'DEMO_ONLY') return 'Using demo walkthrough data only.';
  if (dataStatus === 'WITHHELD') return 'The system is holding this back because the sample is too weak.';
  if (dataStatus === 'INSUFFICIENT_DATA') return 'The system does not have enough clean data yet.';
  return `Current source status: ${dataStatus}.`;
}

function simpleReasonsFromSignal(signal, state) {
  if (!signal) {
    return [
      'There is no clear setup right now.',
      'Safety rules are more important than forcing a trade.',
      sourceNote(state, signal)
    ];
  }

  const panda = parseSignalTags(signal);
  const reasons = [];
  reasons.push(
    signal.direction === 'SHORT'
      ? 'The system sees weakness, so the safer choice is to reduce risk rather than get aggressive.'
      : 'The system sees a cleaner upward move than a random bounce.'
  );
  if (panda.topFactors.length) {
    reasons.push(`The main checks behind it are ${panda.topFactors.join(', ')}.`);
  } else {
    reasons.push('The signal passed the basic trend and safety checks.');
  }
  if (panda.learningEnabled === false) {
    reasons.push('The learning engine has already reduced risk after weak recent results.');
  } else if (panda.learningEnabled === true) {
    reasons.push('The learning engine still allows a small trade today.');
  } else {
    reasons.push('Risk controls are still in charge of position size.');
  }
  return reasons.slice(0, 3);
}

function explainStrategySimply(signal, state) {
  const panda = parseSignalTags(signal);
  const risk = riskLevel(state);
  return {
    verdict: 'Nova uses three simple checks before it shows you an idea.',
    plan: [
      'First it checks whether price is moving cleanly or turning weak.',
      'Then it checks the safety bucket to decide whether a trade is allowed at all.',
      'Finally it uses the learning engine to keep size small when recent results are softer.'
    ],
    why: [
      'This is meant to reduce impulse trades, not increase trading frequency.',
      panda.topFactors.length ? `Today the strongest checks are ${panda.topFactors.join(', ')}.` : 'Today the engine is using its standard price and safety checks.',
      `Current risk level is ${risk.label.toLowerCase()}, so the app keeps the message simple and cautious.`
    ],
    risk: [
      'Nova does not promise a result.',
      'A signal can still fail, so stop loss and small size matter.'
    ],
    evidence: [sourceNote(state, signal)]
  };
}

function buildPayload(intent, state, ticker) {
  const signal = pickTopSignal(state, ticker);
  const holdingsReview = pickHoldingsReview(state);
  const risk = riskLevel(state);
  const posture = marketMood(state);
  const position = positionText(signal);
  const stop = stopText(signal);
  const target = targetText(signal);
  const freshness = signal ? freshnessLabel(signal) : 'unknown';
  const reasons = simpleReasonsFromSignal(signal, state);

  if (intent === 'holdings_risk') {
    if (!holdingsReview?.rows?.length) {
      return {
        verdict: 'I cannot judge your holdings yet because you have not added them.',
        plan: [
          'Open Holdings and add what you own now.',
          'A rough position size is enough to start.',
          'Then I can tell you what to keep, reduce, or sell.'
        ],
        why: [
          'Holdings advice depends on your own positions.',
          'A public signal list cannot replace your own portfolio check.',
          sourceNote(state, signal)
        ],
        risk: ['Without your holdings, the app can only give general guidance.'],
        evidence: [sourceNote(state, signal)]
      };
    }

    const riskiest = (holdingsReview.rows || []).find(
      (row) => row.system_status === 'contradicted' || row.system_status === 'not_supported'
    );
    return {
      verdict: holdingsReview.key_advice || 'Your portfolio needs a risk cleanup before new trades.',
      plan: [
        riskiest ? `Start with ${riskiest.symbol}. That is the first position to review.` : 'Start with your biggest position first.',
        'Reduce repeated exposure before adding anything new.',
        'Only add new risk after the portfolio looks balanced again.'
      ],
      why: [
        `Your current portfolio risk is ${String(holdingsReview.risk?.level || 'medium').toLowerCase()}.`,
        (holdingsReview.risk?.primary_risks || [])[0] || 'The system sees concentration risk in your current mix.',
        `Estimated total unrealized result: ${
          holdingsReview.totals?.estimated_unrealized_pnl_pct === null
            ? 'not enough data'
            : `${round(safeNumber(holdingsReview.totals.estimated_unrealized_pnl_pct) * 100, 1)}%`
        }.`
      ],
      risk: ['Do not add to a weak position just because it is already in your account.'],
      evidence: [sourceNote(state, signal)]
    };
  }

  if (intent === 'explain_strategy') {
    return explainStrategySimply(signal, state);
  }

  if (intent === 'safe_check') {
    return {
      verdict: `Today looks ${risk.label.toLowerCase()} for beginners.`,
      plan: [
        risk.label === 'Dangerous' ? 'Stay defensive and keep cash first.' : `If you act, keep size near ${position} only.`,
        'Use the stop line. Do not widen it after entry.',
        'If the setup feels unclear, waiting is a valid decision.'
      ],
      why: [
        `The system posture today is ${posture}.`,
        reasons[1],
        reasons[2]
      ],
      risk: [
        risk.note,
        'The goal is to avoid bad trades, not to trade every day.'
      ],
      evidence: [sourceNote(state, signal), signal ? `Signal freshness: ${freshness}.` : 'No active signal right now.']
    };
  }

  if (intent === 'buy_or_sell') {
    if (!signal) {
      return {
        verdict: 'Wait. There is no strong idea to act on right now.',
        plan: ['Keep your watchlist ready, but do not force a trade.', 'Come back when a clean setup appears.'],
        why: ['No clear signal is at the top of the list.', 'Safety comes before activity.', sourceNote(state, signal)],
        risk: ['Acting without a clear setup is one of the easiest beginner mistakes.'],
        evidence: [sourceNote(state, signal)]
      };
    }

    return {
      verdict: `${directionLabel(signal)} is the current system call for ${signal.symbol}.`,
      plan: [
        `${directionLabel(signal) === 'Wait' ? 'Do nothing for now.' : `If you act, keep size near ${position}.`}`,
        target !== null ? `Take profit around ${target}.` : 'Take profit only if price moves cleanly in your favor.',
        stop !== null ? `Step out if price falls to ${stop}.` : 'Use a clear stop before you enter.'
      ],
      why: [
        reasons[0],
        reasons[1],
        `This signal was updated ${freshness}.`
      ],
      risk: [
        `For beginners, never go above ${position} on a single idea.`,
        'If the signal is not clear to you, waiting is safer than guessing.'
      ],
      evidence: [sourceNote(state, signal)]
    };
  }

  if (intent === 'why_signal') {
    return {
      verdict: signal
        ? `${signal.symbol} is on top because it looks cleaner than the rest right now.`
        : 'The system is not showing a strong signal right now.',
      plan: [
        signal ? `Treat it as a small, planned trade near ${position}.` : 'Stay patient and let the next clean setup come to you.',
        signal && target !== null ? `Take profit around ${target}.` : 'Only act when entry, stop, and target are all clear.',
        signal && stop !== null ? `Stop loss around ${stop}.` : 'Keep risk small from the start.'
      ].filter(Boolean),
      why: reasons,
      risk: [
        'A clear signal is still not a guarantee.',
        risk.note
      ],
      evidence: [sourceNote(state, signal), signal ? `Signal freshness: ${freshness}.` : 'No signal is active.']
    };
  }

  return {
    verdict: signal
      ? `The clearest idea right now is ${signal.symbol}, but only as a small trade.`
      : 'Today is more about patience than action.',
    plan: [
      signal ? `If you follow the plan, keep it near ${position}.` : 'Wait for the next clean chance.',
      'Check risk first, then decide.',
      'If something feels rushed, skip it.'
    ],
    why: [
      `The current market posture is ${posture}.`,
      reasons[0],
      reasons[2]
    ],
    risk: [
      risk.note,
      'The app is designed to help you stay disciplined, not busy.'
    ],
    evidence: [sourceNote(state, signal)]
  };
}

function detectIntent(question) {
  const text = String(question || '').toLowerCase();

  if (
    text.includes('holdings') ||
    text.includes('持仓') ||
    text.includes('portfolio') ||
    text.includes('my risk')
  ) {
    return 'holdings_risk';
  }
  if (
    text.includes('safe') ||
    text.includes('risk') ||
    text.includes('安全')
  ) {
    return 'safe_check';
  }
  if (
    text.includes('explain strategy') ||
    text.includes('simple language') ||
    text.includes('plain words') ||
    text.includes('策略') ||
    text.includes('解释')
  ) {
    return 'explain_strategy';
  }
  if (
    text.includes('buy or sell') ||
    text.includes('should i buy') ||
    text.includes('should i sell') ||
    text.includes('该买') ||
    text.includes('该卖')
  ) {
    return 'buy_or_sell';
  }
  if (
    text.includes('why this signal') ||
    text.includes('why this') ||
    text.includes('为什么这个信号') ||
    text.includes('为什么今天') ||
    text.includes('why today')
  ) {
    return 'why_signal';
  }
  return 'general';
}

function extractTicker(question) {
  const text = String(question || '');
  const matches = text.match(/[A-Z]{2,10}(?:[-/][A-Z]{2,10})?/g);
  if (!matches?.length) return null;
  return matches.find((item) => item.length >= 3) || null;
}

function toStructuredText(payload) {
  return [
    `VERDICT: ${payload.verdict}`,
    'PLAN:',
    ...payload.plan.map((line) => `- ${line}`),
    'WHY:',
    ...payload.why.map((line) => `- ${line}`),
    'RISK:',
    ...payload.risk.map((line) => `- ${line}`),
    'EVIDENCE:',
    ...payload.evidence.map((line) => `- ${line}`)
  ].join('\n');
}

export function answerWithRetrieval(question, state) {
  const intent = detectIntent(question);
  const ticker = extractTicker(question);
  const payload = buildPayload(intent, state, ticker);
  return {
    intent,
    ticker,
    alphaId: null,
    text: toStructuredText(payload)
  };
}

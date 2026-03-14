import { getAssistantVoiceGuide, getNoActionCopy } from '../copy/novaCopySystem.js';

function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatPrice(value) {
  const num = safeNumber(value, null);
  if (!Number.isFinite(num)) return 'n/a';
  if (Math.abs(num) >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(2)}`;
}

function topSignal(state) {
  const evidence = Array.isArray(state?.evidence?.top_signals) ? state.evidence.top_signals : [];
  const runtime = Array.isArray(state?.signals) ? state.signals : [];
  return evidence[0] || runtime[0] || null;
}

function holdingsRows(state) {
  return Array.isArray(state?.user_context?.holdings_review?.rows) ? state.user_context.holdings_review.rows : [];
}

function normalizeQuestion(question = '') {
  return String(question).trim().toLowerCase();
}

function inferIntent(question = '') {
  const q = normalizeQuestion(question);
  if (q.includes('holding') || q.includes('portfolio') || q.includes('持仓')) return 'holdings';
  if (q.includes('safe') || q.includes('risk') || q.includes('风险')) return 'risk';
  if (q.includes('enter') || q.includes('buy') || q.includes('sell') || q.includes('now')) return 'entry';
  if (q.includes('explain') || q.includes('strategy') || q.includes('how does')) return 'strategy';
  if (q.includes('signal') || q.includes('why')) return 'signal';
  return 'general';
}

function buildEvidenceLine(signal, state) {
  const entryLow = safeNumber(signal?.entry_zone?.low ?? signal?.entry_low ?? signal?.entry, null);
  const entryHigh = safeNumber(signal?.entry_zone?.high ?? signal?.entry_high ?? signal?.entry, null);
  const tp = safeNumber(signal?.take_profit_levels?.[0]?.price ?? signal?.take_profit, null);
  const sl = safeNumber(signal?.stop_loss?.price ?? signal?.invalidation_level, null);
  const confidence = safeNumber(signal?.confidence ?? signal?.conviction, 0);
  const safety = state?.safety?.conclusion || 'Risk is controlled only with small size.';

  return [
    signal ? `${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()} is the current demo action.` : 'No demo signal is loaded.',
    entryLow !== null && entryHigh !== null ? `Entry zone ${formatPrice(entryLow)} to ${formatPrice(entryHigh)}.` : null,
    tp !== null ? `Take profit ${formatPrice(tp)}.` : null,
    sl !== null ? `Stop loss ${formatPrice(sl)}.` : null,
    confidence ? `Confidence ${Math.round(confidence * 100)} out of 100.` : null,
    `Demo note: this answer is coming from the offline investor walkthrough, not the live assistant.`,
    safety
  ]
    .filter(Boolean)
    .join(' ');
}

function structured({ verdict, plan, why, risk, evidence }) {
  return [
    `VERDICT: ${verdict}`,
    '',
    'PLAN:',
    ...plan.map((item) => `- ${item}`),
    '',
    'WHY:',
    ...why.map((item) => `- ${item}`),
    '',
    'RISK:',
    ...risk.map((item) => `- ${item}`),
    '',
    'EVIDENCE:',
    ...evidence.map((item) => `- ${item}`)
  ].join('\n');
}

export function buildDemoAssistantReply(question, state, context = {}) {
  const signal = topSignal(state);
  const intent = inferIntent(question);
  const holdings = holdingsRows(state);
  const safety = state?.safety?.conclusion || 'Only small beginner-sized positions are allowed in this demo.';
  const primaryEvidence = buildEvidenceLine(signal, state);
  const strategySource = signal?.strategy_source || 'AI quant strategy';
  const positionPct = safeNumber(signal?.position_advice?.position_pct, null);
  const posture = state?.decision?.risk_state?.posture || state?.decision?.summary?.risk_posture || 'WAIT';
  const locale = context?.locale || 'en';
  const voice = getAssistantVoiceGuide({ locale, posture, userState: intent });
  const noAction = getNoActionCopy({ locale, posture, seed: String(signal?.symbol || 'demo') });

  if (intent === 'holdings') {
    const biggest = holdings[0];
    return structured({
      verdict: biggest
        ? `${voice.opener} ${biggest.symbol || 'Your portfolio'} is still manageable. The real point is not adding chaos on top of it.`
        : `${voice.opener} The demo portfolio is intentionally controlled. That restraint is part of the story, not a missing feature.`,
      plan: biggest
        ? [
            `Keep ${biggest.symbol || 'the largest position'} if it still matches the system direction.`,
            'Do not add another big position in the same theme today.',
            'If you want to reduce risk, trim the most crowded name first.'
          ]
        : ['Load the investor demo holdings list.', 'Keep total exposure moderate.', 'Avoid stacking similar positions.'],
      why: [
        'The demo portfolio is built to look realistic, not over-optimized.',
        'The app is trying to show discipline and clarity, not aggressive turnover.',
        'Position advice stays simple so a first-time investor can understand it.'
      ],
      risk: [
        'Even a positive demo portfolio should not be read as a live result.',
        'Concentration is still the main thing to watch in a small account.'
      ],
      evidence: [primaryEvidence]
    });
  }

  if (intent === 'risk') {
    return structured({
      verdict: safety,
      plan: [
        `If you trade this setup, keep it to ${positionPct ? `${Math.round(positionPct)}%` : 'a small starter size'}.`,
        'Use the stop as written. Do not widen it after entry.',
        'If the price jumps away from the buy zone, wait instead of chasing.'
      ],
      why: [
        'The demo keeps size modest on purpose. Confidence is not a license to get loud.',
        'Risk comes first because this product is built to reduce emotional mistakes.',
        signal ? `${signal.symbol} is shown because it is the cleanest setup in the demo pack today.` : 'There is no active demo signal right now.'
      ],
      risk: [
        'Safe does not mean guaranteed.',
        'The correct move can still be to wait if price leaves the planned zone.'
      ],
      evidence: [primaryEvidence, voice.risk_explain]
    });
  }

  if (intent === 'entry') {
    const entryLow = safeNumber(signal?.entry_zone?.low ?? signal?.entry_low ?? signal?.entry, null);
    const entryHigh = safeNumber(signal?.entry_zone?.high ?? signal?.entry_high ?? signal?.entry, null);
    const tp = safeNumber(signal?.take_profit_levels?.[0]?.price ?? signal?.take_profit, null);
    const sl = safeNumber(signal?.stop_loss?.price ?? signal?.invalidation_level, null);
    return structured({
      verdict: signal
        ? `${voice.opener} Yes, but only if ${signal.symbol} stays in the planned entry zone.`
        : `${voice.no_action} ${noAction.completion}`,
      plan: [
        entryLow !== null && entryHigh !== null
          ? `Only enter between ${formatPrice(entryLow)} and ${formatPrice(entryHigh)}.`
          : 'Only enter if the planned setup is still valid.',
        tp !== null ? `Take profit is ${formatPrice(tp)}.` : 'Take profit comes first; do not freestyle the target.',
        sl !== null ? `Stop loss is ${formatPrice(sl)}.` : 'Use the stop exactly as shown.',
        `Keep size to ${positionPct ? `${Math.round(positionPct)}%` : 'a small allocation'}.`
      ],
      why: [
        'This demo is built to show a clear plan before action.',
        'Entry, target, and stop are shown together so the trade is understandable at a glance.',
        'The point is controlled execution, not maximum exposure.'
      ],
      risk: ['If price moves too far from the zone, the right choice is to wait.'],
      evidence: [primaryEvidence]
    });
  }

  if (intent === 'strategy') {
    return structured({
      verdict: 'Nova uses a simple evidence-first process, then keeps size small.',
      plan: [
        'It looks for the clearest setup on the board.',
        'It checks whether the market is calm enough to act.',
        'It turns that into one simple action card with entry, target, stop, and size.'
      ],
      why: [
        `${strategySource} is the strategy label shown on the demo card.`,
        'The experience is designed for retail users, so it explains the action before the details.',
        'The goal is to reduce impulsive trading, not to make the app look complicated.'
      ],
      risk: [
        'The demo shows a controlled example, not a live promise.',
        'Risk controls still matter more than confidence labels.'
      ],
      evidence: [primaryEvidence, voice.risk_explain]
    });
  }

  if (intent === 'signal') {
    return structured({
      verdict: signal
        ? `${voice.opener} ${signal.symbol} is the main demo signal because it is the cleanest action card available right now.`
        : `${voice.no_action} ${noAction.notify}`,
      plan: [
        signal ? `Focus on ${signal.symbol} instead of spreading attention across too many names.` : 'Wait for the next clean setup.',
        'Use the card as the full plan: entry, target, stop, and size.',
        'If you want more detail, compare it with the recent demo signals underneath.'
      ],
      why: [
        'The demo is built to show one strong action instead of ten noisy ideas.',
        'A single clear card is easier for an investor to understand than a full trading dashboard.',
        signal ? `${signal.symbol} passed the demo selection rules and is shown first.` : 'No setup passed the demo selection rules.'
      ],
      risk: [
        'High confidence still requires small size.',
        'A clean setup can fail, so the stop remains part of the plan.'
      ],
      evidence: [primaryEvidence, voice.intercept]
    });
  }

  return structured({
    verdict: signal
      ? `${voice.opener} The current demo idea is ${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()}, with a clear plan and small size.`
      : `${voice.no_action} ${noAction.completion}`,
    plan: [
      'Start from the main action card.',
      'Check the risk box before doing anything.',
      'If needed, ask one follow-up question in plain language.'
    ],
    why: [
      'The demo assistant is intentionally simple and investor-friendly.',
      'It is offline on purpose so the walkthrough is stable even without network access.',
      context?.page ? `This answer is anchored to the ${context.page} screen context.` : 'This answer is anchored to the current demo context.'
    ],
    risk: ['This is a demo walkthrough, not a live trading session.'],
    evidence: [primaryEvidence, voice.wrap]
  });
}

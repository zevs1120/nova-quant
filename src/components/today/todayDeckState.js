export function buildTodayDeckState(args) {
  const {
    decision,
    signals,
    topSignalEvidence,
    assetClass,
    now,
    desiredSignalCount,
    investorDemoEnabled,
    todayCardLimit,
    helpers,
  } = args;
  const {
    pickBestSignal,
    buildSignalsFromDecision,
    buildSignalRail,
    buildDemoFallbackSignal,
    sortSignalsForDisplay,
  } = helpers;

  const bestSignal = pickBestSignal(signals, topSignalEvidence, assetClass, now);
  const decisionSignals = buildSignalsFromDecision(decision, signals, now);
  const fallbackSignals = buildSignalRail(
    signals,
    topSignalEvidence,
    assetClass,
    now,
    desiredSignalCount,
  );
  const actionSignals = decisionSignals.length
    ? decisionSignals
    : fallbackSignals.length
      ? fallbackSignals.slice(0, desiredSignalCount)
      : investorDemoEnabled
        ? [buildDemoFallbackSignal(assetClass, now)]
        : [];
  const deckSignals = sortSignalsForDisplay(actionSignals);
  const visibleDeckSignals =
    todayCardLimit === null ? deckSignals : deckSignals.slice(0, todayCardLimit);
  const hiddenDeckCount = Math.max(
    0,
    Number(decision?.membership_gate?.hidden_action_cards || 0) ||
      deckSignals.length - visibleDeckSignals.length,
  );

  return {
    bestSignal,
    decisionSignals,
    fallbackSignals,
    actionSignals,
    deckSignals,
    visibleDeckSignals,
    hiddenDeckCount,
  };
}

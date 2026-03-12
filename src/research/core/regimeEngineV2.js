import { clamp, round } from '../../engines/math.js';

const REGIME_POLICY = Object.freeze({
  trend: {
    preferred_strategy_families: ['Momentum / Trend', 'Relative Strength'],
    suppressed_strategy_families: ['Mean Reversion'],
    default_sizing_multiplier: 1,
    risk_posture: 'constructive',
    recommended_user_posture: 'GO',
    expected_trade_density_band: { min: 5, max: 14 }
  },
  range: {
    preferred_strategy_families: ['Mean Reversion', 'Relative Strength'],
    suppressed_strategy_families: ['Momentum / Trend'],
    default_sizing_multiplier: 0.78,
    risk_posture: 'selective',
    recommended_user_posture: 'REDUCE',
    expected_trade_density_band: { min: 3, max: 10 }
  },
  high_volatility: {
    preferred_strategy_families: ['Regime Transition', 'Crypto-Specific'],
    suppressed_strategy_families: ['Momentum / Trend'],
    default_sizing_multiplier: 0.56,
    risk_posture: 'defensive',
    recommended_user_posture: 'REDUCE',
    expected_trade_density_band: { min: 2, max: 8 }
  },
  risk_off: {
    preferred_strategy_families: ['Regime Transition', 'Mean Reversion'],
    suppressed_strategy_families: ['Momentum / Trend', 'Relative Strength', 'Crypto-Specific'],
    default_sizing_multiplier: 0.34,
    risk_posture: 'capital_preservation',
    recommended_user_posture: 'SKIP',
    expected_trade_density_band: { min: 0, max: 4 }
  }
});

function normalizeLegacyTag(tag) {
  const text = String(tag || '').toLowerCase();
  if (text.includes('trend up')) return 'uptrend';
  if (text.includes('trend down')) return 'downtrend';
  if (text.includes('range')) return 'range';
  if (text.includes('high volatility')) return 'high_vol';
  if (text.includes('risk recovery')) return 'uptrend';
  return 'neutral';
}

function classifyRegime(scores, legacyTag) {
  if (scores.risk_off >= 0.68) {
    return {
      primary: 'risk_off',
      combined: 'stress_risk_off'
    };
  }

  if (scores.high_volatility >= 0.62) {
    if (legacyTag === 'uptrend') {
      return {
        primary: 'high_volatility',
        combined: 'uptrend_high_vol'
      };
    }
    if (legacyTag === 'downtrend') {
      return {
        primary: 'high_volatility',
        combined: 'downtrend_high_vol'
      };
    }
    return {
      primary: 'high_volatility',
      combined: 'range_high_vol'
    };
  }

  if (scores.trend >= scores.range) {
    return {
      primary: 'trend',
      combined: legacyTag === 'downtrend' ? 'downtrend_normal' : 'uptrend_normal'
    };
  }

  return {
    primary: 'range',
    combined: scores.high_volatility >= 0.5 ? 'range_high_vol' : 'range_normal'
  };
}

function templateCompatible(template, primary, combined) {
  const tags = (template.compatible_regimes || []).map((item) => String(item).toLowerCase());
  if (!tags.length) return true;
  if (tags.includes('all')) return true;
  const hitPrimary = tags.some((item) => primary.includes(item) || item.includes(primary));
  const hitCombined = tags.some((item) => combined.includes(item) || item.includes(combined));
  const hitTransition = tags.includes('transition') && (primary === 'range' || primary === 'high_volatility' || primary === 'risk_off');
  return hitPrimary || hitCombined || hitTransition;
}

function buildWarnings({ scores, safetyMode, breadthRatio, volatilityStress }) {
  const warnings = [];
  if (scores.risk_off >= 0.68 || safetyMode === 'do not trade') {
    warnings.push('Risk-off pressure is elevated; stand-aside remains a valid decision.');
  }
  if (scores.high_volatility >= 0.62 || volatilityStress >= 0.6) {
    warnings.push('Volatility regime is elevated; reduce size and avoid weak setups.');
  }
  if (breadthRatio <= 0.4) {
    warnings.push('Market breadth is weak; avoid concentrated directional exposure.');
  }
  if (!warnings.length) {
    warnings.push('No hard regime warning; continue with disciplined sizing and risk controls.');
  }
  return warnings;
}

function confidenceFromScores(scores = {}) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[1] ?? 0;
  const second = entries[1]?.[1] ?? 0;
  const margin = Math.max(0, top - second);
  return round(clamp(0.55 * top + 0.45 * margin, 0, 1), 4);
}

function primaryFromLegacyRegimeTag(tag) {
  const text = String(tag || '').toLowerCase();
  if (text.includes('high volatility') || text.includes('high_vol')) return 'high_volatility';
  if (text.includes('trend')) return 'trend';
  if (text.includes('range')) return 'range';
  if (text.includes('risk off') || text.includes('risk_off')) return 'risk_off';
  return 'range';
}

function buildTransitionHistory(historicalSnapshots = [], currentPrimary = 'range') {
  const sorted = [...(historicalSnapshots || [])]
    .filter((item) => item?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const compact = sorted.map((item) => ({
    date: item.date,
    primary: primaryFromLegacyRegimeTag(item.market_regime || item.regime || '')
  }));
  if (!compact.length) {
    return {
      transitions: [],
      transition_count: 0,
      recent_sequence: [currentPrimary],
      last_transition_at: null
    };
  }

  const transitions = [];
  for (let i = 1; i < compact.length; i += 1) {
    const prev = compact[i - 1];
    const cur = compact[i];
    if (prev.primary === cur.primary) continue;
    transitions.push({
      date: cur.date,
      from: prev.primary,
      to: cur.primary
    });
  }

  return {
    transitions: transitions.slice(-24),
    transition_count: transitions.length,
    recent_sequence: compact.slice(-7).map((item) => item.primary),
    last_transition_at: transitions.at(-1)?.date || null
  };
}

function warningSeverity(warnings = []) {
  if ((warnings || []).some((item) => item.toLowerCase().includes('risk-off'))) return 'HIGH';
  if ((warnings || []).some((item) => item.toLowerCase().includes('volatility'))) return 'MEDIUM';
  return 'LOW';
}

function signalCompatibilityChecks(signals = [], state = {}, strategyActivation = []) {
  const byFamily = new Map();
  for (const row of strategyActivation || []) {
    const current = byFamily.get(row.family_name) || [];
    current.push(row);
    byFamily.set(row.family_name, current);
  }

  return (signals || []).map((signal) => {
    const family = signal.strategy_family || 'unknown';
    const familyRows = byFamily.get(family) || [];
    const activeFamily = familyRows.some((item) => item.activation === 'ACTIVE');
    const suppressedFamily = familyRows.some((item) => item.activation === 'SUPPRESSED');
    const compatible = familyRows.length ? familyRows.some((item) => item.compatible) : true;

    let regimeCompatibility = 'compatible';
    let multiplier = 1;
    if (!compatible || state.primary === 'risk_off') {
      regimeCompatibility = 'blocked';
      multiplier = 0;
    } else if (suppressedFamily) {
      regimeCompatibility = 'suppressed';
      multiplier = 0.78;
    } else if (!activeFamily && state.recommended_user_posture === 'REDUCE') {
      regimeCompatibility = 'reduced';
      multiplier = 0.88;
    }

    return {
      signal_id: signal.signal_id,
      symbol: signal.symbol,
      strategy_family: family,
      regime_state: state.primary,
      compatibility: regimeCompatibility,
      score_multiplier: multiplier
    };
  });
}

export function buildRegimeEngineState({
  asOf = new Date().toISOString(),
  championState = {},
  strategyFamilyRegistry = null,
  historicalSnapshots = [],
  signals = []
} = {}) {
  const insights = championState?.insights || {};
  const safety = championState?.safety || {};

  const breadthRatio = Number(insights?.breadth?.ratio ?? 0.5);
  const volatilityStress = Number(insights?.volatility?.stress ?? 0.5);
  const riskOnOffScore = Number(insights?.risk_on_off?.score ?? 0.5);
  const riskOnOffState = String(insights?.risk_on_off?.state || 'Neutral');
  const safetyMode = String(safety?.mode || 'normal risk');
  const legacyTag = normalizeLegacyTag(insights?.regime?.tag);

  const trendScore = clamp(
    0.36 * breadthRatio +
      0.24 * (riskOnOffState.toLowerCase().includes('risk-on') ? 1 : 0.4) +
      0.2 * (legacyTag === 'uptrend' ? 1 : legacyTag === 'downtrend' ? 0.2 : 0.5) +
      0.2 * (1 - volatilityStress),
    0,
    1
  );
  const rangeScore = clamp(
    0.35 * (1 - Math.abs(breadthRatio - 0.5) * 2) +
      0.3 * (legacyTag === 'range' ? 1 : 0.4) +
      0.2 * (1 - Math.abs(riskOnOffScore - 0.5) * 2) +
      0.15 * (1 - volatilityStress),
    0,
    1
  );
  const highVolScore = clamp(
    0.58 * volatilityStress +
      0.22 * (legacyTag === 'high_vol' ? 1 : 0.2) +
      0.2 * (safetyMode === 'trade light' || safetyMode === 'do not trade' ? 1 : 0.2),
    0,
    1
  );
  const riskOffScore = clamp(
    0.34 * (riskOnOffState.toLowerCase().includes('risk-off') ? 1 : 0.2) +
      0.26 * (safetyMode === 'do not trade' ? 1 : safetyMode === 'trade light' ? 0.6 : 0.2) +
      0.2 * (1 - breadthRatio) +
      0.2 * volatilityStress,
    0,
    1
  );

  const scores = {
    trend: round(trendScore, 4),
    range: round(rangeScore, 4),
    high_volatility: round(highVolScore, 4),
    risk_off: round(riskOffScore, 4)
  };

  const regime = classifyRegime(scores, legacyTag);
  const policy = REGIME_POLICY[regime.primary] || REGIME_POLICY.range;

  const templates = strategyFamilyRegistry?.templates || [];
  const strategyActivation = templates.map((template) => {
    const compatible = templateCompatible(template, regime.primary, regime.combined);
    const preferred = policy.preferred_strategy_families.includes(template.family_name);
    const suppressed = policy.suppressed_strategy_families.includes(template.family_name);

    let activation = 'STANDBY';
    let reason = 'Compatible but not preferred in current regime.';

    if (!compatible) {
      activation = 'INACTIVE';
      reason = 'Template incompatible with current regime requirements.';
    } else if (suppressed) {
      activation = 'SUPPRESSED';
      reason = 'Suppressed by regime policy to reduce false positives.';
    } else if (preferred) {
      activation = 'ACTIVE';
      reason = 'Preferred family under current regime policy.';
    }

    return {
      template_id: template.template_id,
      family_name: template.family_name,
      strategy_template_name: template.strategy_template_name,
      activation,
      compatible,
      scoring_multiplier: activation === 'ACTIVE' ? 1 : activation === 'SUPPRESSED' ? 0.75 : activation === 'INACTIVE' ? 0 : 0.9,
      reason
    };
  });

  const warnings = buildWarnings({
    scores,
    safetyMode,
    breadthRatio,
    volatilityStress
  });
  const severity = warningSeverity(warnings);
  const confidence = confidenceFromScores(scores);
  const transitions = buildTransitionHistory(historicalSnapshots, regime.primary);
  const bySignalCompatibility = signalCompatibilityChecks(
    signals,
    {
      primary: regime.primary,
      recommended_user_posture: policy.recommended_user_posture
    },
    strategyActivation
  );

  return {
    generated_at: asOf,
    classifier_version: 'regime-engine.v2',
    inspectable_inputs: {
      legacy_regime_tag: insights?.regime?.tag || '--',
      breadth_ratio: round(breadthRatio, 4),
      volatility_stress: round(volatilityStress, 4),
      risk_on_off_score: round(riskOnOffScore, 4),
      risk_on_off_state: riskOnOffState,
      safety_mode: safetyMode
    },
    scores,
    regime_confidence: confidence,
    state: {
      primary: regime.primary,
      combined: regime.combined,
      risk_posture: policy.risk_posture,
      recommended_user_posture: policy.recommended_user_posture,
      default_sizing_multiplier: policy.default_sizing_multiplier,
      warning_severity: severity,
      expected_trade_density_band: policy.expected_trade_density_band
    },
    policy: {
      preferred_strategy_families: policy.preferred_strategy_families,
      suppressed_strategy_families: policy.suppressed_strategy_families,
      expected_trade_density_band: policy.expected_trade_density_band
    },
    transition_history: transitions,
    strategy_activation: strategyActivation,
    by_signal_compatibility: bySignalCompatibility,
    warnings,
    copilot_guidance: {
      posture: policy.recommended_user_posture,
      narrative:
        policy.recommended_user_posture === 'GO'
          ? 'Market state supports selective execution with normal sizing discipline.'
          : policy.recommended_user_posture === 'REDUCE'
            ? 'Market state is mixed or stressed; reduce size and focus on top quality setups.'
            : 'Market state is risk-off; skipping new trades is a valid high-quality action.'
    }
  };
}

export { REGIME_POLICY };

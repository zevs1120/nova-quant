import reliabilityScenarioPackRaw from '../../../data/reference_seeds/reliability_scenario_pack.json' with { type: 'json' };

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScenario(row = {}) {
  return {
    scenario_id: row.scenario_id || 'unknown',
    title: row.title || row.scenario_id || 'Unnamed Scenario',
    category: row.category || 'uncategorized',
    severity: row.severity || 'medium',
    targets: toArray(row.targets),
    parameters: row.parameters || {},
  };
}

export function loadReliabilityScenarioPacks(overrides = {}) {
  const source = {
    ...reliabilityScenarioPackRaw,
    ...(overrides || {}),
  };

  return {
    seed_id: source.seed_id || 'reliability_scenario_pack',
    generated_at: source.generated_at || new Date().toISOString(),
    description: source.description || 'Reliability scenario packs',
    scenarios: toArray(source.scenarios).map(normalizeScenario),
  };
}

export function listReliabilityScenarioIds(overrides = {}) {
  const packs = loadReliabilityScenarioPacks(overrides);
  return packs.scenarios.map((row) => row.scenario_id);
}

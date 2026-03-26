/**
 * Strategy loader — loads strategy templates from YAML files.
 *
 * Borrows the declarative strategy pattern from daily_stock_analysis's
 * SkillManager (src/agent/skills/base.py) and adapts it for Nova Quant's
 * engine-driven architecture.
 *
 * YAML files define strategy metadata (features, rules, costs, regime tags)
 * that integrate with the existing strategyTemplates system. No LLM calls —
 * all evaluation remains engine-driven.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import yaml from 'js-yaml';

const REQUIRED_FIELDS = [
  'strategy_id',
  'strategy_family',
  'asset_class',
  'market',
  'features',
  'rules',
];

/**
 * Validate a parsed YAML strategy template against the required schema.
 * @param {object} data - Parsed YAML object
 * @param {string} source - Source file path for error messages
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTemplate(data, source = 'unknown') {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [`${source}: not a valid YAML object`] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) {
      errors.push(`${source}: missing required field '${field}'`);
    }
  }

  if (data.features && !Array.isArray(data.features)) {
    errors.push(`${source}: 'features' must be an array`);
  }

  if (data.rules && !Array.isArray(data.rules)) {
    errors.push(`${source}: 'rules' must be an array`);
  }

  if (data.regime_tags && !Array.isArray(data.regime_tags)) {
    errors.push(`${source}: 'regime_tags' must be an array`);
  }

  if (data.trigger_conditions && !Array.isArray(data.trigger_conditions)) {
    errors.push(`${source}: 'trigger_conditions' must be an array`);
  }

  // P5: validate trigger_conditions — reject mixed, validate structured schema
  if (Array.isArray(data.trigger_conditions) && data.trigger_conditions.length > 0) {
    const VALID_OPS = ['>', '>=', '<', '<=', '==', '!=', 'in'];
    const hasStructured = data.trigger_conditions.some(
      (c) => typeof c === 'object' && c !== null && c.field && c.op,
    );
    const hasLegacy = data.trigger_conditions.some((c) => typeof c === 'string');
    if (hasStructured && hasLegacy) {
      errors.push(
        `${source}: 'trigger_conditions' must be all structured objects or all strings, not mixed`,
      );
    }
    // Validate each non-string entry has required schema
    for (let i = 0; i < data.trigger_conditions.length; i += 1) {
      const c = data.trigger_conditions[i];
      if (typeof c === 'string') continue;
      if (typeof c !== 'object' || c === null) {
        errors.push(`${source}: trigger_conditions[${i}] must be a string or structured object`);
        continue;
      }
      if (!c.field || typeof c.field !== 'string') {
        errors.push(`${source}: trigger_conditions[${i}] missing required 'field' (string)`);
      }
      if (!c.op || !VALID_OPS.includes(c.op)) {
        errors.push(
          `${source}: trigger_conditions[${i}] has invalid 'op' '${c.op}', must be one of: ${VALID_OPS.join(', ')}`,
        );
      }
      if (c.value === undefined || c.value === null) {
        errors.push(`${source}: trigger_conditions[${i}] missing required 'value'`);
      }
    }
  }

  if (data.invalidation && !Array.isArray(data.invalidation)) {
    errors.push(`${source}: 'invalidation' must be an array`);
  }

  if (data.cost_assumptions && typeof data.cost_assumptions !== 'object') {
    errors.push(`${source}: 'cost_assumptions' must be an object`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalize a parsed YAML object into a strategy template matching
 * the STRATEGY_TEMPLATES schema used throughout the engine.
 * @param {object} data - Validated YAML data
 * @returns {object} Normalized template
 */
export function normalizeTemplate(data) {
  const trailing = data.trailing_rule || {};

  return {
    strategy_id: String(data.strategy_id).trim(),
    strategy_family: String(data.strategy_family || '').trim(),
    asset_class: String(data.asset_class || 'US_STOCK').trim(),
    market: String(data.market || 'US').trim(),
    default_timeframe: String(data.default_timeframe || '1D').trim(),
    name: String(data.name || data.strategy_id).trim(),
    features: Array.isArray(data.features) ? data.features.map(String) : [],
    trigger_conditions: Array.isArray(data.trigger_conditions)
      ? data.trigger_conditions.map((c) =>
          typeof c === 'object' && c !== null && c.field && c.op ? c : String(c),
        )
      : [],
    invalidation: Array.isArray(data.invalidation) ? data.invalidation.map(String) : [],
    tp_ladder_rule: String(data.tp_ladder_rule || 'TP1 at 1R, TP2 at 1.6R.'),
    not_to_trade: Array.isArray(data.not_to_trade) ? data.not_to_trade.map(String) : [],
    cost_assumptions: {
      fee_bps: Number(data.cost_assumptions?.fee_bps ?? 3),
      spread_bps: Number(data.cost_assumptions?.spread_bps ?? 2),
      slippage_bps: Number(data.cost_assumptions?.slippage_bps ?? 3),
      funding_est_bps: Number(data.cost_assumptions?.funding_est_bps ?? 0),
      basis_est: Number(data.cost_assumptions?.basis_est ?? 0),
    },
    rules: Array.isArray(data.rules) ? data.rules.map(String) : [],
    trailing_rule: {
      mode: String(trailing.mode || 'ema-trail'),
      trigger_r_multiple: Number(trailing.trigger_r_multiple ?? 1.2),
      trail_distance_pct: Number(trailing.trail_distance_pct ?? 1.5),
    },
    regime_tags: Array.isArray(data.regime_tags) ? data.regime_tags.map(String) : [],
    source: 'yaml',
  };
}

/**
 * Load a single strategy template from a YAML file.
 * @param {string} filePath - Absolute path to the YAML file
 * @returns {object} Normalized template
 * @throws {Error} If file is invalid or missing required fields
 */
export function loadStrategyFromYaml(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Strategy file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  let data;

  try {
    data = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${filePath}: ${err.message}`);
  }

  const { valid, errors } = validateTemplate(data, filePath);
  if (!valid) {
    throw new Error(`Invalid strategy template:\n  ${errors.join('\n  ')}`);
  }

  return normalizeTemplate(data);
}

/**
 * Load all strategy templates from YAML files in a directory.
 * Skips files that fail to parse (logs warning to console).
 * @param {string} dirPath - Absolute path to the directory
 * @returns {object[]} Array of normalized templates
 */
export function loadStrategiesFromDirectory(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    return [];
  }

  const files = readdirSync(dirPath)
    .filter((f) => ['.yaml', '.yml'].includes(extname(f).toLowerCase()))
    .sort();

  const templates = [];

  for (const file of files) {
    const fullPath = join(dirPath, file);
    try {
      const template = loadStrategyFromYaml(fullPath);
      templates.push(template);
    } catch (err) {
      console.warn(`[strategyLoader] Skipping ${file}: ${err.message}`);
    }
  }

  return templates;
}

/**
 * Merge YAML-loaded templates into built-in templates.
 * YAML templates override built-in templates with the same strategy_id.
 * @param {object} builtinMap - Map of strategy_id → template (built-in)
 * @param {object[]} yamlTemplates - Array of YAML-loaded templates
 * @returns {object} Merged map of strategy_id → template
 */
export function mergeTemplates(builtinMap, yamlTemplates) {
  const merged = { ...builtinMap };

  for (const template of yamlTemplates) {
    merged[template.strategy_id] = template;
  }

  return merged;
}

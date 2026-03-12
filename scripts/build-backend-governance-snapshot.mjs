import fs from 'node:fs';
import path from 'node:path';
import { runQuantPipeline } from '../src/engines/pipeline.js';

const state = runQuantPipeline({
  as_of: new Date().toISOString(),
  config: {
    risk_profile: 'balanced'
  }
});

const research = state.research || {};
const compact = {
  generated_at: research.generated_at,
  dates: {
    start: research.dates?.[0] || null,
    end: research.dates?.at(-1) || null,
    count: research.dates?.length || 0
  },
  governance: research.governance,
  dataset_governance: {
    registry: research.multi_asset?.dataset_governance?.registry || [],
    snapshots: research.multi_asset?.dataset_governance?.snapshots || [],
    label_manifests: research.multi_asset?.dataset_governance?.label_manifests || {},
    feature_manifests_detailed: research.multi_asset?.dataset_governance?.feature_manifests_detailed || {}
  },
  registry_system: research.registry_system,
  promotion: {
    comparisons: research.comparisons || [],
    decisions: research.promotion_decisions || []
  },
  paper_ops: research.paper_ops,
  diagnostics: research.diagnostics,
  internal_intelligence: research.internal_intelligence,
  weekly_system_review: research.weekly_system_review,
  contract_checks: research.contract_checks
};

const target = path.resolve('data/snapshots/backend-governance.sample.json');
fs.writeFileSync(target, JSON.stringify(compact, null, 2));
console.log(`Wrote ${target}`);

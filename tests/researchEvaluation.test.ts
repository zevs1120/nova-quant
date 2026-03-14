import { describe, expect, it } from 'vitest';
import { getDb } from '../src/server/db/database.js';
import { ensureSchema } from '../src/server/db/schema.js';
import { MarketRepository } from '../src/server/db/repository.js';
import {
  buildExperimentRegistryView,
  buildResearchWorkflowPlan,
  buildStrategyEvaluationReport,
  buildValidationReport
} from '../src/server/research/evaluation.js';

function repo() {
  const db = getDb();
  ensureSchema(db);
  return new MarketRepository(db);
}

describe('research evaluation layer', () => {
  it('builds strategy evaluation and validation reports from canonical evidence', () => {
    const marketRepo = repo();
    const evaluation = buildStrategyEvaluationReport(marketRepo);
    const validation = buildValidationReport(marketRepo);

    expect(evaluation).toHaveProperty('report');
    if (evaluation.report) {
      expect(evaluation.report).toHaveProperty('measured_metrics');
      expect(evaluation.report).toHaveProperty('overfitting_risk');
      expect(evaluation.report.overfitting_risk).toHaveProperty('level');
    }

    expect(validation).toHaveProperty('validation_report');
    if (validation.validation_report) {
      expect(validation.validation_report).toHaveProperty('checks');
      expect(validation.validation_report).toHaveProperty('decision_gate');
    }
  });

  it('surfaces experiment registry memory and workflow plans', () => {
    const marketRepo = repo();
    const experiments = buildExperimentRegistryView(marketRepo);
    const workflow = buildResearchWorkflowPlan({ topic: 'momentum' });

    expect(experiments).toHaveProperty('records');
    expect(Array.isArray(experiments.records)).toBe(true);
    expect(workflow.workflow.stages.length).toBeGreaterThanOrEqual(5);
    expect(workflow.workflow.next_best_action).toContain('momentum');
  });
});

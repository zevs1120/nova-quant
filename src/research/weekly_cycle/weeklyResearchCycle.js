import { round } from '../../engines/math.js';

function summaryLine(label, value) {
  return `- ${label}: ${value}`;
}

function topReasons(rows = [], field = 'reason', count = 3) {
  return (rows || [])
    .slice(0, count)
    .map((row) => row[field])
    .filter(Boolean);
}

export function buildWeeklyResearchCycle({
  asOf = new Date().toISOString(),
  regimeState = {},
  signalFunnel = {},
  shadowLog = {},
  strategyGovernance = {},
  strategyDiscovery = {},
  walkForward = {},
  aiResearchCopilot = {},
  portfolioSimulation = {},
} = {}) {
  const starvation = signalFunnel?.overall?.generated
    ? Number(signalFunnel?.overall?.executable || 0) / Number(signalFunnel?.overall?.generated || 1)
    : 0;

  const degraded = (strategyGovernance?.strategies || []).filter(
    (row) => row?.degradation_signals?.status === 'warning',
  );
  const promotions = (strategyGovernance?.decisions || []).filter(
    (row) => row.action === 'PROMOTE',
  );
  const demotions = (strategyGovernance?.decisions || []).filter((row) =>
    ['DEMOTE', 'ROLLBACK', 'RETIRE'].includes(row.action),
  );

  const report = {
    generated_at: asOf,
    cycle_version: 'weekly-research-cycle.v1',
    cycle_steps: [
      'analyze_funnel_diagnostics',
      'analyze_shadow_logs',
      'analyze_strategy_performance',
      'identify_degradation_signals',
      'identify_research_gaps',
      'suggest_hypothesis_exploration',
      'generate_research_summary',
    ],
    discovery_results: {
      generated_candidates: strategyDiscovery?.summary?.generated_candidates || 0,
      survivors_after_validation: strategyDiscovery?.summary?.survivors_after_validation || 0,
      promoted_to_shadow: strategyDiscovery?.summary?.promoted_to_shadow || 0,
      discovery_success_rate: strategyDiscovery?.summary?.discovery_success_rate || 0,
    },
    validation_results: {
      evaluated_strategies: walkForward?.summary?.evaluated_strategies || 0,
      oos_survivors: walkForward?.summary?.oos_survivors || 0,
      cost_survivors: walkForward?.summary?.cost_survivors || 0,
      fragile_strategies: walkForward?.summary?.fragile_strategies || [],
    },
    strategy_promotions_demotions: {
      promotions: promotions.map((row) => ({
        strategy_id: row.strategy_id,
        to_stage: row.to_stage,
      })),
      demotions: demotions.map((row) => ({ strategy_id: row.strategy_id, to_stage: row.to_stage })),
      degradation_alert_count: degraded.length,
    },
    signal_density_issues: {
      generated: signalFunnel?.overall?.generated || 0,
      executable: signalFunnel?.overall?.executable || 0,
      filled: signalFunnel?.overall?.filled || 0,
      executable_ratio: round(starvation, 4),
      bottleneck_stage: signalFunnel?.bottleneck?.stage || 'unknown',
      no_trade_top_reasons: topReasons(signalFunnel?.no_trade_reason_top_n || [], 'reason', 5),
    },
    regime_insights: {
      current_regime: regimeState?.state?.primary || 'unknown',
      posture: regimeState?.state?.recommended_user_posture || '--',
      confidence: regimeState?.regime_confidence || 0,
      warnings: regimeState?.warnings || [],
    },
    shadow_insights: {
      total_shadow_records: shadowLog?.total_records || 0,
      strictness_watch_count: shadowLog?.strictness_watch_count || 0,
      missed_opportunity_ratio: shadowLog?.missed_opportunity_ratio || 0,
      top_filter_reasons: topReasons(shadowLog?.records || [], 'filter_reason', 5),
    },
    portfolio_insights: {
      portfolio_return: portfolioSimulation?.metrics?.portfolio_return || 0,
      drawdown: portfolioSimulation?.metrics?.drawdown || 0,
      sharpe: portfolioSimulation?.metrics?.sharpe || 0,
      diversification_score:
        portfolioSimulation?.diagnostics?.diversification_contribution?.diversification_score || 0,
    },
    research_recommendations: aiResearchCopilot?.top_actions || [],
  };

  report.markdown = buildWeeklyResearchReportMarkdown(report);
  return report;
}

export function buildWeeklyResearchReportMarkdown(report = {}) {
  const lines = [];
  lines.push('# Weekly Research Report');
  lines.push('');
  lines.push(`Generated at: ${report.generated_at || new Date().toISOString()}`);
  lines.push('');
  lines.push('## Discovery Results');
  lines.push(
    summaryLine('Generated candidates', report.discovery_results?.generated_candidates ?? 0),
  );
  lines.push(
    summaryLine(
      'Survivors after validation',
      report.discovery_results?.survivors_after_validation ?? 0,
    ),
  );
  lines.push(summaryLine('Promoted to SHADOW', report.discovery_results?.promoted_to_shadow ?? 0));
  lines.push(
    summaryLine('Discovery success rate', report.discovery_results?.discovery_success_rate ?? 0),
  );
  lines.push('');

  lines.push('## Validation Results');
  lines.push(
    summaryLine('Evaluated strategies', report.validation_results?.evaluated_strategies ?? 0),
  );
  lines.push(summaryLine('OOS survivors', report.validation_results?.oos_survivors ?? 0));
  lines.push(summaryLine('Cost survivors', report.validation_results?.cost_survivors ?? 0));
  lines.push(
    summaryLine(
      'Fragile strategies',
      (report.validation_results?.fragile_strategies || []).join(', ') || 'none',
    ),
  );
  lines.push('');

  lines.push('## Promotions / Demotions');
  lines.push(
    summaryLine('Promotion count', report.strategy_promotions_demotions?.promotions?.length ?? 0),
  );
  lines.push(
    summaryLine(
      'Demotion/retire count',
      report.strategy_promotions_demotions?.demotions?.length ?? 0,
    ),
  );
  lines.push(
    summaryLine(
      'Degradation alerts',
      report.strategy_promotions_demotions?.degradation_alert_count ?? 0,
    ),
  );
  lines.push('');

  lines.push('## Signal Density');
  lines.push(summaryLine('Generated', report.signal_density_issues?.generated ?? 0));
  lines.push(summaryLine('Executable', report.signal_density_issues?.executable ?? 0));
  lines.push(summaryLine('Filled', report.signal_density_issues?.filled ?? 0));
  lines.push(summaryLine('Executable ratio', report.signal_density_issues?.executable_ratio ?? 0));
  lines.push(
    summaryLine('Bottleneck', report.signal_density_issues?.bottleneck_stage ?? 'unknown'),
  );
  lines.push(
    summaryLine(
      'Top no-trade reasons',
      (report.signal_density_issues?.no_trade_top_reasons || []).join(', ') || 'none',
    ),
  );
  lines.push('');

  lines.push('## Regime Insights');
  lines.push(summaryLine('Regime', report.regime_insights?.current_regime ?? 'unknown'));
  lines.push(summaryLine('Posture', report.regime_insights?.posture ?? '--'));
  lines.push(summaryLine('Confidence', report.regime_insights?.confidence ?? 0));
  lines.push(
    summaryLine('Warnings', (report.regime_insights?.warnings || []).join(' | ') || 'none'),
  );
  lines.push('');

  lines.push('## Shadow Insights');
  lines.push(summaryLine('Shadow records', report.shadow_insights?.total_shadow_records ?? 0));
  lines.push(
    summaryLine('Strictness watch count', report.shadow_insights?.strictness_watch_count ?? 0),
  );
  lines.push(
    summaryLine('Missed opportunity ratio', report.shadow_insights?.missed_opportunity_ratio ?? 0),
  );
  lines.push(
    summaryLine(
      'Top filter reasons',
      (report.shadow_insights?.top_filter_reasons || []).join(', ') || 'none',
    ),
  );
  lines.push('');

  lines.push('## Portfolio Simulation');
  lines.push(summaryLine('Portfolio return', report.portfolio_insights?.portfolio_return ?? 0));
  lines.push(summaryLine('Drawdown', report.portfolio_insights?.drawdown ?? 0));
  lines.push(summaryLine('Sharpe proxy', report.portfolio_insights?.sharpe ?? 0));
  lines.push(
    summaryLine('Diversification score', report.portfolio_insights?.diversification_score ?? 0),
  );
  lines.push('');

  lines.push('## Research Recommendations');
  if ((report.research_recommendations || []).length) {
    for (const row of report.research_recommendations || []) {
      lines.push(`- [${row.severity || 'medium'}] ${row.action}: ${row.why}`);
    }
  } else {
    lines.push('- No critical recommendations this cycle.');
  }

  lines.push('');
  return lines.join('\n');
}

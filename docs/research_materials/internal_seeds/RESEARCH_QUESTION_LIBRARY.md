# Research Question Library

Last updated: 2026-03-08

This library contains 100 practical research questions for weekly Nova Quant improvement loops.

## signal_starvation

1. Which funnel stage removed the largest number of candidates this week, and was that intentional?
2. Did universe shrinkage, filter strictness, or execution assumptions drive the drop in executable opportunities?
3. How many near-threshold signals were rejected that later moved favorably?
4. Are score thresholds calibrated to current volatility regime or still tuned for last month?
5. Is low trade density concentrated in one market (equity vs crypto) or system-wide?
6. Which strategy families generated raw signals but failed conversion most often?
7. Did risk bucket caps block too many A/B quality setups during otherwise constructive sessions?
8. How much trade density would recover if one filter were relaxed by 10 percent?
9. Are we suppressing too many opportunities due to stale or missing feature updates?
10. Do no-trade days align with regime guidance, or indicate over-filtering drift?

## regime_coverage_gaps

1. Which regimes currently have no active SHADOW or CANARY candidates?
2. Are high-volatility periods under-covered by specialized templates?
3. Do we over-rely on trend templates in range-dominant markets?
4. Which regime transitions produce the highest failure rate in validation?
5. How stable is strategy performance when regime classification confidence is low?
6. Are risk-off regimes triggering posture changes quickly enough?
7. Which family-regime pair shows persistent under-generation despite clear hypothesis support?
8. Do regime suppression rules remove too much diversification across families?
9. Where does regime state disagree with macro proxy behavior most often?
10. What new hypotheses are needed for regimes with low discovery success rate?

## overfitting_suspicion

1. Which candidates pass in-sample metrics but fail walk-forward windows immediately?
2. How sensitive is candidate quality score to small parameter perturbations?
3. Are top candidates clustered around edge-of-range parameter values?
4. Do surviving candidates rely on one narrow date segment for most returns?
5. Is regime-sliced performance too concentrated in a single state?
6. How many candidates fail under +50% cost stress after passing base assumptions?
7. Are validation survivors showing unstable turnover behavior across windows?
8. Did recent promotions come from genuinely new hypotheses or minor parameter tweaks?
9. How often does hold-for-retest become reject on rerun with shifted windows?
10. Which templates exhibit recurring fragility warnings in neighborhood analysis?

## cost_sensitivity

1. What is the degradation in expected return under +25% and +50% cost scenarios?
2. Which strategies are most exposed to slippage during high-volatility windows?
3. Are spread-sensitive templates being blocked when liquidity stress rises?
4. How many promoted candidates remain viable after harsher fill assumptions?
5. Which markets show the largest execution gap between executable and filled stages?
6. Are turnover-heavy candidates still positive after realistic fee drag?
7. How do cost assumptions differ between equity and crypto templates in scoring?
8. Do we need venue-specific slippage presets for top promoted candidates?
9. Are cost assumptions too optimistic for weekend or off-hours crypto trading?
10. Which templates should be downgraded due to persistent cost fragility?

## shadow_opportunity_review

1. Which rejection reasons appear most often in shadow opportunities that later outperform?
2. Would reduced-size versions of blocked trades have improved portfolio outcomes?
3. Are specific hypothesis-template pairs overrepresented in missed-opportunity logs?
4. Which regime produces the highest ratio of potentially over-strict rejections?
5. How often do shadow winners coincide with risk budget exhaustion flags?
6. Are score-threshold rejects meaningfully different from risk-filter rejects ex post?
7. Do shadow outcomes support relaxing any one filter without large drawdown trade-offs?
8. Which assets repeatedly appear in shadow positives but remain excluded from official opportunities?
9. How should shadow evidence feed next-cycle candidate generation constraints?
10. Are we logging sufficient context to explain why a shadow opportunity was rejected?

## strategy_family_underperformance

1. Which strategy family has the largest drop in quality score over the last four cycles?
2. Are underperforming families failing from signal quality, risk gating, or execution assumptions?
3. Do weak families underperform in all regimes or only specific conditions?
4. Which hypotheses inside the underperforming family remain worth preserving?
5. Is family underperformance linked to data quality issues in key features?
6. Should family-level risk multipliers be adjusted before retiring templates?
7. How much diversification value does a weak family still contribute?
8. Are there alternative templates within the same family that pass robustness checks?
9. Did recent market structure changes invalidate core assumptions of this family?
10. What is the rollback plan if a currently promoted family degrades further?

## diversification_contribution

1. Which promoted candidates provide the most incremental diversification versus current PROD set?
2. Are newly promoted candidates overly correlated with existing champions?
3. How many CANARY candidates improve drawdown profile without reducing hit rate materially?
4. Do diversification gains persist after cost and slippage stress?
5. Are we concentrating discovery promotions in one style bucket?
6. Which family combinations produce the best portfolio-level robustness by regime?
7. Do correlation caps block genuinely diversifying opportunities?
8. How does diversification score evolve after a candidate moves from SHADOW to CANARY?
9. Which candidates reduce tail risk during risk-off windows?
10. Are portfolio contribution metrics aligned with realized paper-trading behavior?

## opportunity_object_quality

1. Do opportunity objects consistently include entry, stop, target, and invalidation fields?
2. Are rationale summaries traceable to concrete evidence fields and source metrics?
3. Which opportunities are missing lineage metadata needed for audit replay?
4. Are risk bucket explanations understandable to non-quant users?
5. Do regime compatibility fields match current regime engine output at generation time?
6. How often do opportunity size recommendations conflict with portfolio risk budget state?
7. Are blocked opportunities accompanied by explicit and structured rejection reasons?
8. Do multi-asset opportunities use consistent naming and timestamp alignment?
9. Are opportunity confidence values calibrated or drifting toward uninformative clustering?
10. What minimum contract checks should fail fast before an opportunity is published?

## ai_copilot_output_quality

1. Can Copilot explain why today posture is GO/REDUCE/SKIP using current evidence objects?
2. Are Copilot answers grounded in latest regime/risk/funnel snapshots or stale memory?
3. Which Copilot prompts most often produce vague answers lacking decision traceability?
4. Can Copilot distinguish between data-limited uncertainty and model-driven conviction?
5. Are holdings-specific Copilot responses aligned with portfolio analyzer outputs?
6. Does Copilot correctly cite why a candidate was filtered out or size-reduced?
7. Are beginner-mode explanations accurate without leaking advanced jargon errors?
8. How often does Copilot propose actions inconsistent with risk bucket constraints?
9. Can Copilot summarize weekly learning without overstating synthetic backtest confidence?
10. Which additional evidence fields would most improve Copilot decision transparency?

## product_facing_execution_quality

1. How different are paper fills from backtest assumptions for top opportunity types?
2. Which user-visible recommendations are most sensitive to execution slippage drift?
3. Are no-trade recommendations issued early enough to reduce impulsive behavior?
4. Do holdings warnings reflect actual concentration and overlap from user positions?
5. Which pages consume research outputs with the highest field mismatch rate?
6. Are daily brief recommendations stable enough for users to trust check-in behavior?
7. How often do mode-specific (Beginner/Standard/Advanced) summaries diverge from same underlying data?
8. Are weekly review highlights tied to measurable system improvements or placeholders?
9. Which operational failures most often degrade product trust despite model quality?
10. What is the smallest product-facing metric set needed for daily disciplined decisions?

Total questions: 100

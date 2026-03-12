# Testing And Stress Framework

Last updated: 2026-03-09

## Goal

Increase Nova Quant reliability credibility by combining:

- correctness tests,
- failure-path tests,
- deterministic stress scenario packs,
- system-level brittleness summaries.

## 1) Audit: Current Test Coverage

### Already tested before this phase

- Signal object generation baseline
- Regime classification (trend/risk-off)
- Risk bucket allow/reduce/block decisions
- Discovery engine structural outputs and traceability
- Walk-forward + replay structure
- Execution realism model sensitivity
- Governance workflow object presence
- Portfolio simulation output presence
- Evidence system object presence
- Pipeline smoke integrity

### Under-tested before this phase

1. Failure-oriented multi-module behavior under adversarial conditions.
2. Concentration/crowding stress in portfolio simulation.
3. Discovery starvation diagnosis quality.
4. Governance behavior under poor-fill realism pressure.
5. Cross-layer graceful degradation checks (decision layer under stress).
6. Module-level “what fails first” reporting.

### Untested failure paths before this phase

- Elevated volatility with defensive posture checks.
- Strict-fill monotonicity failure detection.
- Fake diversification (high correlation with deceptive spread of strategies).
- Candidate quality collapse under strict validation thresholds.

## 2) New Reliability Framework

### Runtime components

- Scenario seed:  
  `data/reference_seeds/reliability_scenario_pack.json`
- Scenario loader:  
  `src/research/reliability/scenarioPacks.js`
- Stress runner:  
  `src/research/reliability/reliabilityStressFramework.js`
- CLI script:  
  `scripts/run-reliability-stress.mjs`

### Output artifact

- `docs/research_reports/RELIABILITY_STRESS_REPORT.json`

## 3) Expanded Test Matrix (A-I)

- A. signal generation correctness:  
  `tests/reliabilityCoverage.test.ts` (`A:` case)
- B. regime classification behavior:  
  `tests/reliabilityCoverage.test.ts` (`B:` case)
- C. risk filtering behavior:  
  `tests/reliabilityCoverage.test.ts` (`C:` case)
- D. candidate discovery behavior:  
  `tests/reliabilityCoverage.test.ts` + `tests/reliabilityStressFramework.test.ts`
- E. validation pipeline behavior:  
  `tests/reliabilityCoverage.test.ts` + `tests/reliabilityStressFramework.test.ts`
- F. governance workflow transitions under stress:  
  `tests/reliabilityCoverage.test.ts`
- G. portfolio simulation consistency under crowding stress:  
  `tests/reliabilityCoverage.test.ts`
- H. decision object completeness:  
  `tests/reliabilityCoverage.test.ts`
- I. logging/traceability presence:  
  `tests/reliabilityCoverage.test.ts`

## 4) Stress Scenarios Covered

1. elevated volatility
2. risk-off regime
3. concentrated exposure
4. high slippage
5. poor fills
6. strategy starvation
7. strategy crowding / fake diversification
8. degraded candidate quality

## 5) What The Framework Reports

Per scenario:

- module-level checks (pass/fail),
- first failure module/check,
- failed module list,
- graceful degradation flag,
- strategy-family sensitivity hints.

Global summary:

- weakest modules by pass-rate,
- strongest modules by pass-rate,
- first-failure chain across scenarios,
- graceful degradation ratio across all scenarios.

## 6) How To Run

Run full tests:

```bash
npm run test:data
```

Run reliability report generation:

```bash
npm run stress:reliability
```

Direct command with custom args:

```bash
node scripts/run-reliability-stress.mjs --as-of 2026-03-08T00:00:00.000Z --risk-profile balanced --out docs/research_reports/RELIABILITY_STRESS_REPORT.json
```

## 7) Current Reliability Read (This Phase)

Based on current stress report:

- Most market/risk guardrail scenarios degrade gracefully.
- Primary brittleness surfaced in:
  - poor fill realism behavior,
  - governance reaction depth under poor fills,
  - portfolio crowding/fake-diversification stress.

These are now explicit and machine-reportable instead of implicit.

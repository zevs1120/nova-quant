> Archived / Historical
> Archived on: 2026-03-09
> Applicable snapshot: pre-credibility-cleanup review cycle
> This file is retained for traceability and does not represent current system status.

# Nova Quant Global Review — Module Status Matrix

As of 2026-03-08.

Legend:
- `Implemented`
- `Partially implemented`
- `Stub/placeholder`
- `Mock/demo only`
- `Production-intended`

| Subsystem | Status | Reality Check | Notes |
|---|---|---|---|
| Front-end shell (`src/App.jsx`, tabs) | Implemented + Production-intended | Real UX flow | 4-tab IA and daily check-in flow are active. |
| Today / Daily Brief | Implemented + Production-intended | Real UI + mixed data | Good decision hierarchy; data substrate still mixed. |
| AI page UX | Implemented + Production-intended | Real UI + retrieval mock path | Structured answers and context cards exist; default retrieval path is mostly local/system-generated. |
| Holdings analyzer (`src/research/holdingsAnalyzer.js`) | Implemented + Production-intended | Real logic | Strong practical value; depends on modeled system state quality. |
| More/Weekly/Discipline UX | Implemented | Real UI | Good retention scaffolding; not tied to live execution outcomes yet. |
| API endpoints (`api/*.ts`) | Implemented + Production-intended | Real handlers | `/chat`, `/assets`, `/ohlcv` exist. |
| API market module retrieval | Partially implemented | Mixed | `getMarketModules` reads `public/mock/market-features.json`. |
| Server DB schema/repository | Implemented + Production-intended | Real SQLite-based persistence | Good for local/dev operations. |
| Quant service (`src/server/quant/service.ts`) | Implemented | Mixed mock + structured contracts | Strong contracts, but seeded by mock files for signals/performance. |
| External broker/exchange adapters | Partially implemented | Mock/demo only | `createBrokerAdapter`/`createExchangeAdapter` currently return mock snapshots. |
| OpenAI provider adapter | Implemented + Production-intended | Real integration path | Works with API key; fallback paths still present elsewhere. |
| Multi-asset pipeline (`src/research/multiAssetPipeline.js`) | Implemented + Production-intended | Real structure + sample fallback | Strong orchestration; adapters often sample fallback by default. |
| Equity adapter | Implemented | Mixed | Live-path metadata exists; data typically generated from sample feed. |
| Options adapter | Implemented | Mixed/demo-biased | Options chain/snapshots currently simulated when no live feed connected. |
| Crypto spot adapter | Implemented | Mixed | Live-path metadata exists; default runtime often sample fallback. |
| Dataset governance (`src/research/governance/datasetGovernance.js`) | Implemented + Production-intended | Real object outputs | Registry/manifest/snapshots available and queryable. |
| Strategy family registry (`strategyFamilies.js`) | Implemented + Production-intended | Real object model | Broad family/template metadata and governance hooks exist. |
| Feature-signal layer (`featureSignalLayer.js`) | Implemented + Production-intended | Real object transformation | Strong lifecycle abstraction and product-facing opportunity contracts. |
| Regime engine (`regimeEngineV2.js`) | Implemented + Production-intended | Real logic on modeled inputs | Confidence/transitions/policy checks exist; depends on proxy inputs. |
| Risk bucket system (`riskBucketSystem.js`) | Implemented + Production-intended | Real decision objects | Allow/reduce/block explanations are explicit and useful. |
| Signal funnel diagnostics (`signalFunnelDiagnosticsV2.js`) | Implemented + Production-intended | Real counters | Good stage attribution; still dependent on synthetic signal stream. |
| Shadow opportunity log (`shadowOpportunityLog.js`) | Partially implemented | Experimental + synthetic forward path | Valuable structure, but forward returns are deterministic synthetic proxies. |
| Walk-forward validation (`walkForwardValidation.js`) | Partially implemented | Experimental proxy realism | Good anti-overfit structure; not event-level replay. |
| Strategy governance (`strategyGovernanceV2.js`) | Implemented + Production-intended | Real lifecycle objects | Promotion/demotion/rollback logic exists; reviewer sign-off is weak. |
| Discovery engine (`strategyDiscoveryEngine.js`) | Implemented + Production-intended | Real engine flow + simulated metrics | Good architecture and traceability; validation metrics still proxy-driven. |
| Hypothesis registry runtime | Partially implemented | Real but narrow | In-code registry (~10 core hypotheses) not yet seed-library powered. |
| Template registry runtime | Partially implemented | Real but narrow | In-code registry (~8 templates) not yet fully seed-driven. |
| Candidate validation pipeline | Partially implemented | Structured but synthetic | 5-stage gating exists; quick backtest/robustness are deterministic simulations. |
| Candidate scoring | Implemented | Real scoring logic | Works as governance gate; quality depends on upstream proxy metrics. |
| Research evidence system | Implemented + Production-intended | Real lineage objects | Strong chain object quality and completeness scoring. |
| Portfolio simulation engine | Partially implemented | Production-intended but proxy-based | Good portfolio diagnostics; returns/correlation dynamics are deterministic proxies. |
| AI research copilot | Implemented + Production-intended | Rule-based analytic layer | Generates structured recommendations from diagnostics; no model learning loop yet. |
| Weekly research cycle/report | Implemented + Production-intended | Real generated artifact | Weekly report is generated; historical persistence/process rigor still light. |
| Research automation loop | Implemented + Production-intended | Real summary/alerts | Useful orchestration output; alert quality depends on proxy data. |
| Research materials pack | Implemented | Real docs + seeds | Strong static knowledge assets, not fully runtime-consumed. |
| Advanced research pack | Implemented | Real doctrine assets | Strong standards, still partially operationalized. |
| Test suite (`tests/`) | Implemented | Real automated checks | 17 files / 30 tests passing; mostly contract/smoke-level depth. |
| Build system | Implemented | Real | Build passes; bundle chunk size warning indicates optimization gap. |

## Matrix Verdict
The repository is **module-complete enough for serious review**, but several core outcomes still rely on **simulation proxies and mock data paths**. The main risk is not missing architecture; it is realism and enforcement depth.

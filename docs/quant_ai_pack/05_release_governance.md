# Release Governance

## Lifecycle

### DRAFT

- research only
- no user exposure
- broad experimentation allowed

### SHADOW

- runs on live data
- produces hypothetical actions
- compared against production stack
- no user-facing action

### CANARY

- limited user exposure or limited internal activation
- strict monitoring
- small risk budget only

### PROD

- fully promoted
- appears in decision engine
- subject to ongoing health checks

### DEGRADE

- reduced weight / reduced risk budget
- still monitored

### RETIRE

- no new signals
- preserved for postmortem and learnings

## Mandatory promotion memo

Every promotion requires a short markdown memo with:

- what changed
- why it should improve the system
- validation summary
- expected trade density impact
- expected risk impact
- rollback trigger

## Auto-downgrade triggers

- prolonged underperformance vs expected band
- live vs backtest divergence beyond threshold
- cost drift beyond tolerance
- regime behavior mismatch
- signal density abnormality

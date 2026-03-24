# Data Quality and Governance (v1)

## Checks Implemented

Module: `src/research/dataQualityChecks.js`

1. Missingness checks
2. Duplicate checks
3. Timestamp/date monotonicity checks
4. Schema validation against required fields
5. Stale data detection by asset class
6. Source health summary
7. Asset coverage summary

## Output Objects

- `source_health_summary`
- `coverage_summary`
- `missingness_summary`
- `duplicate_summary`
- `monotonicity_summary`
- `schema_validation`
- `stale_data_detection`
- `dataset_health`
- `top_issues`
- `latest_data_status`

## How It Is Used

- Internal Research page (`Data Hub` panel)
- AI retrieval explanations (coverage/quality/source boundary questions)
- Dataset snapshot metadata

## Known v1 Limits

- Live API health is represented as path readiness in frontend mode; runtime defaults to sample fallback.
- Options and equities live paths may require licensed data/API keys.
- Crypto source harmonization across multiple exchanges is not complete yet.

# Product Failure Modes

Last updated: 2026-03-08

This document explains how quant-system quality can fail at the product layer.

## 1) Complexity overload

- Failure: user cannot complete daily check-in quickly.
- Cause: too many modules/metrics in primary flow.
- Control: conclusion -> action -> explanation -> details hierarchy.

## 2) Non-executable opportunities

- Failure: product shows setups that cannot be traded realistically.
- Cause: weak execution filtering and stale data.
- Control: opportunity contract must include execution/risk validity fields.

## 3) Smart-sounding but weak AI responses

- Failure: copilot outputs generic language without evidence linkage.
- Cause: narrative generation not grounded in diagnostics objects.
- Control: structured answer format tied to evidence IDs and rationale fields.

## 4) Weak risk communication

- Failure: users misinterpret conviction as certainty.
- Cause: no clear risk boundary/invalidation statements.
- Control: always include risk posture and invalidation conditions.

## 5) Missing no-trade guidance

- Failure: product encourages unnecessary action.
- Cause: bias toward opportunity display over discipline guidance.
- Control: no-trade recommendations are mandatory first-class outputs.

## 6) Research-to-product translation gap

- Failure: strong research outputs do not improve user decisions.
- Cause: object schema mismatch or overly technical language.
- Control: product-facing opportunity contract and layered explanation modes.

## 7) Holdings context ignored

- Failure: advice is market-generic and not personalized.
- Cause: weak integration with holdings risk analysis.
- Control: holdings-aware recommendation and overlap/concentration diagnostics.

## 8) False continuity signals

- Failure: streak/progress design accidentally encourages overtrading.
- Cause: engagement metrics not aligned with discipline goals.
- Control: reward check-in/risk discipline, never trade frequency.

## 9) Inconsistent state semantics

- Failure: conflicting stage names and user confusion.
- Cause: inconsistent naming across backend/UI.
- Control: unified lifecycle/status taxonomy and strict contract checks.

## 10) Trust erosion from unexplained changes

- Failure: users lose confidence when recommendations shift unexpectedly.
- Cause: no explanation of regime/risk changes.
- Control: change-explanation objects surfaced in Today/AI/Weekly outputs.

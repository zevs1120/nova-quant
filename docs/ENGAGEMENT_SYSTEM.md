# Nova Quant Engagement System

Last updated: 2026-03-14

## Purpose

Nova Quant should build a daily **confirmation habit**, not a high-frequency trading habit.

The engagement system is designed around one question:

> "Should I come back and confirm today's judgment?"

It does **not** try to maximize clicks through FOMO, urgency spam, or trading gamification.

## Core Product Principles

- Morning check over market addiction
- Discipline over trade count
- Protection over stimulation
- Wrap-up over noise
- AI as explanation layer, not hype layer

## Canonical Objects

The backend now produces one grounded engagement snapshot with:

- `daily_check_state`
- `habit_state`
- `daily_wrap_up`
- `widget_summary`
- `notification_center`
- `recommendation_change`
- `ui_regime_state`
- `notification_preferences`

All of these are derived from:

- persisted `decision_snapshots`
- user ritual events
- notification preferences
- current risk posture and top action summary

## Morning Check

Morning Check is a lightweight confirmation ritual:

- one headline
- one risk posture
- one top action worth noticing
- one short "why now"
- one explicit completion state

States:

- `PENDING`
- `REFRESH_REQUIRED`
- `COMPLETED`

The completion marker is grounded in the current decision snapshot fingerprint, so if the top action
or risk posture changes later, the system can honestly move from `COMPLETED` back to
`REFRESH_REQUIRED`.

## Notification Philosophy

Notification categories:

- `RHYTHM`
- `STATE_SHIFT`
- `PROTECTIVE`
- `WRAP_UP`

The system only emits notification candidates when there is a grounded reason:

- today's judgment was updated
- the risk posture changed
- the user should be protected from piling on risk
- an evening wrap-up is ready

Notifications are deliberately:

- calm
- brief
- non-promotional
- non-FOMO

## Widget Philosophy

Widget support is implemented as a backend summary contract first.

Current widget data surfaces:

- `state_widget`
- `action_widget`
- `change_widget`

This is intentionally designed as a truthful preview layer for:

- future native iOS/Android widgets
- lock-screen summaries
- in-app widget preview cards

Nova Quant does not pretend to ship native widgets where the current web runtime cannot.

## Discipline System

Nova Quant rewards:

- daily Morning Check completion
- respecting risk boundaries
- completing wrap-up
- steady weekly review rhythm

It does **not** reward:

- more trades
- more clicks
- more screen time
- more risk-taking

The main habit outputs are:

- `discipline_score`
- `behavior_quality`
- daily/weekly streaks
- `no_action_value_line`

## AI Grounding

The assistant now receives a compact engagement summary:

- morning check status
- wrap-up readiness / completion
- discipline score
- behavior quality
- recommendation change summary

This lets Nova answer questions like:

- "Why should I check again today?"
- "Why is the system more defensive now?"
- "Why does no action still count as a good decision?"
- "What mattered most in today's wrap-up?"

## Engineering Notes

Persistence:

- `user_ritual_events`
- `notification_events`
- `user_notification_preferences`

Key APIs:

- `POST /api/engagement/state`
- `POST /api/engagement/morning-check`
- `POST /api/engagement/boundary`
- `POST /api/engagement/wrap-up`
- `POST /api/engagement/weekly-review`
- `GET /api/widgets/summary`
- `GET /api/notifications/preview`
- `GET /api/notification-preferences`
- `POST /api/notification-preferences`

## Honest Boundaries

- No fake native push delivery is claimed.
- No fake iOS/Android widget runtime is claimed.
- Notification candidates are generated and stored, but actual device delivery depends on future native/web notification integration.
- Demo mode may still use local fallbacks when the explicit demo runtime bypasses the backend.

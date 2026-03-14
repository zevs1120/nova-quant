# NovaQuant Copy Operating System

## Purpose

NovaQuant copy is not decorative writing. It is part of the decision system.

The copy layer exists to make the same risk-aware, evidence-aware judgment legible across:

- homepage stance
- Today Risk
- Morning Check
- action cards
- widget summaries
- notifications
- discipline feedback
- evening wrap-up
- Nova Assistant

The product is not trying to increase trading frequency. It is inviting the user back to confirm whether today deserves action.

## Brand Voice Constitution

NovaQuant should sound like:

- calm
- sharp
- restrained
- evidence-first
- quietly alive
- slightly witty when it improves clarity
- protective when the user is likely to overreach

NovaQuant should not sound like:

- a broker pushing order flow
- a finance influencer
- a mascot
- a hype bot
- a cold terminal
- a generic LLM assistant

### Language principles

1. Protect judgment before expanding risk.
2. Invite the user back to confirm, not to chase.
3. Let waiting feel deliberate, not empty.
4. Sound alive, but never loud.
5. Use wit to clarify, not to entertain.
6. Keep opportunity language crisp, never euphoric.
7. Make high-risk language feel like a steady hand, not a siren.

### Guardrails

Forbidden patterns include:

- FOMO language
- “act now” style urgency
- “must buy” / “必上车” style certainty inflation
- mascot / baby-talk phrasing
- reward language tied to frequent trading
- hype framing on defensive or wait days

## Tone Matrix

Tone is driven by a small matrix that product, backend, frontend, and assistant all share.

### Risk posture tone

| Posture | Copy tone | Interaction tone |
| --- | --- | --- |
| `DEFEND` | boundary-first, protective, slightly sharper | contained, steadier, lower amplitude |
| `WAIT` | quiet, complete, intentionally uneventful | minimal, calmer, more settled |
| `PROBE` | selective, partial permission, still disciplined | measured, lightly suspended |
| `ATTACK` | clearer and more focused, never hyped | crisper, cleaner, not louder |

### Conviction overlay

- low conviction: more caveats, softer verbs, stronger reminder to wait
- medium conviction: selective permission with sizing discipline
- high conviction: clearer permission to focus, never a permission slip for oversized risk

### User-state overlay

- Morning Check pending: invite and orient
- Morning Check completed: settle and reduce re-check anxiety
- no-action confirmed: completion and maturity
- user looks impulsive: sharper, but never shaming
- user already concentrated: protective, personalized, narrower
- wrap-up completed: close the loop, leave the day quieter

## State-to-Copy Mapping

The canonical mappings live in:

- [/Users/qiao/Downloads/nova-quant/src/copy/novaCopySystem.js](/Users/qiao/Downloads/nova-quant/src/copy/novaCopySystem.js)

Primary selectors:

- `getDailyStanceCopy`
- `getTodayRiskCopy`
- `getMorningCheckCopy`
- `getActionCardCopy`
- `getNoActionCopy`
- `getNotificationCopy`
- `getWidgetCopy`
- `getDisciplineCopy`
- `getWrapUpCopy`
- `getAssistantVoiceGuide`
- `getUiRegimeTone`
- `getCopyGuardrails`

These selectors are driven by real state:

- `risk_posture`
- `daily_check_state`
- `recommendation_change`
- `noActionDay`
- `widget type`
- `notification category`
- `user behavior quality`

## Surface Rules

### Homepage

- one-line stance must be short and decisive
- Today Risk must feel like climate, not a technical label
- the top action card can feel alive, but cannot become promotional
- no-action days must still end with completion

### Morning Check

- the opening line should feel like “today’s view has arrived”
- the CTA is about confirmation, not participation
- completion feedback should feel anchoring, not celebratory

### Action Card

- why-now copy should explain ranking, not market drama
- caution copy should slow the user down when needed
- invalidation copy should describe what removes permission to act

### Widgets and notifications

- both are recall surfaces, not urgency surfaces
- language should feel like “worth a calm return”
- no “you are missing it” framing

### Assistant

- same person as the product
- a little dry wit is allowed
- no coaching-bro energy
- no marketing or pseudo-mystical AI voice

## Playful but Mature

NovaQuant permits:

- slight dry humor about noise, impatience, and false certainty
- elegant framing of restraint
- slightly sharper language on defensive days
- quiet, memorable lines that make the product feel alive

NovaQuant forbids:

- mascot behavior
- exaggerated personification
- meme or slang tone
- emotional escalation
- trading excitement as feedback

Good examples:

- “The market is clearer today. That is still not a request for theatrics.”
- “The useful decision can still be to leave the portfolio exactly where it is.”
- “Do not confuse empty space with an invitation to fill it.”

Bad examples:

- “快冲”
- “你又要错过了”
- “今天必上车”
- “继续 streak 吧”

## Engineering Integration

The copy operating system is wired into:

- decision engine:
  - [/Users/qiao/Downloads/nova-quant/src/server/decision/engine.ts](/Users/qiao/Downloads/nova-quant/src/server/decision/engine.ts)
- engagement engine:
  - [/Users/qiao/Downloads/nova-quant/src/server/engagement/engine.ts](/Users/qiao/Downloads/nova-quant/src/server/engagement/engine.ts)
- assistant prompts:
  - [/Users/qiao/Downloads/nova-quant/src/server/chat/prompts.ts](/Users/qiao/Downloads/nova-quant/src/server/chat/prompts.ts)
- assistant types/context:
  - [/Users/qiao/Downloads/nova-quant/src/server/chat/types.ts](/Users/qiao/Downloads/nova-quant/src/server/chat/types.ts)
- homepage rendering:
  - [/Users/qiao/Downloads/nova-quant/src/components/TodayTab.jsx](/Users/qiao/Downloads/nova-quant/src/components/TodayTab.jsx)
- app locale plumbing:
  - [/Users/qiao/Downloads/nova-quant/src/App.jsx](/Users/qiao/Downloads/nova-quant/src/App.jsx)

## What This Avoids

This system is explicitly designed to avoid:

- finance-app hype
- generic AI filler language
- copy drift across surfaces
- opportunity states sounding like promotions
- defensive days sounding empty or punitive

It keeps NovaQuant:

- restrained but not dull
- useful but not robotic
- memorable without becoming playful in a childish way

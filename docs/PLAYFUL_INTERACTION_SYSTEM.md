# NovaQuant Playful Interaction System

## Purpose

NovaQuant should feel alive without becoming loud.

This system exists to make users want to come back and confirm today's judgment, not to pressure them into trading more often. The product should feel:

- calm
- sharp
- slightly witty
- stateful
- disciplined
- quietly memorable

It should not feel:

- childish
- gamified in a casino-like way
- mascot-driven
- hype-oriented
- overloaded with fancy motion

## Core Definition

NovaQuant's playfulness is:

- a subtle sense that the system has a mood because the market has a mood
- a small amount of timing, rhythm, and tone that makes checking in feel satisfying
- a sense that "today's view has arrived" rather than "the page refreshed"
- the feeling that restraint can still be rewarding

It is not:

- reward loops around trading frequency
- animated excitement
- emotional pressure
- FOMO copy

## Perception Layer Principle

The playful layer is not there to decorate the product.

It exists to support a bigger product claim:

> NovaQuant should feel like a judgment surface, not a finance dashboard.

That means the first-open experience should communicate:

- the system already did the first read
- the user is here to confirm, not to scan everything
- a no-action day is still complete
- the product is alive because the market state is alive, not because the UI is noisy

## Motion Principles

### Why motion exists

Motion is used for only three purposes:

1. State arrival
   - today's judgment arrives
   - risk climate is different from yesterday

2. Action hierarchy
   - rank 1 action feels primary
   - updated cards feel recently changed

3. Completion feedback
   - Morning Check is done
   - wrap-up is complete
   - no-action days still feel resolved

### Motion constraints

- short
- low amplitude
- soft easing
- never decorative without meaning
- never used to provoke urgency

### Motion tones by risk state

- `opportunity`
  - clearer entry
  - slightly crisper rise
  - firmer emphasis
- `watchful`
  - measured reveal
  - soft emphasis
  - quiet drift
- `defensive`
  - steadier arrival
  - contained movement
  - less visual spread
- `quiet`
  - minimal movement
  - completion over stimulation

## Playfulness Principles

### What counts as "fun" in NovaQuant

- a line of copy that makes a user pause and nod
- a status change that feels like weather shifting
- a completion moment that feels composed
- a card that feels like a live judgment object, not a static tile

### What does not count

- novelty for novelty's sake
- jokes that undercut trust
- cute anthropomorphic behavior
- excessive confetti, badges, flame streaks, or reward loops

## Completion Feedback Principles

### Morning Check

Completion means:

- today's most important decision has been acknowledged
- the user no longer needs to keep poking around for noise
- the UI should settle slightly after confirmation

Desired feeling:

- "today has been noted"
- "the important part is done"

### No-action day

Completion means:

- restraint was intentional
- there is still informational value in opening the product
- the system protected the user from forcing action

Desired feeling:

- "nothing urgent was lost"
- "not acting was still a sharp decision"

### Wrap-up

Completion means:

- the day has been closed
- the user leaves with one clear takeaway, not five noisy insights

Desired feeling:

- "today has been collected and put away"

## Personality in Interaction

### Product voice

NovaQuant should sound:

- calm
- precise
- slightly dry
- lightly protective
- quietly confident

NovaQuant should not sound:

- excited
- promotional
- flattering
- juvenile
- like a financial influencer

### AI assistant tone

The assistant can be lightly witty, but only in service of better judgment.

Good examples:

- "The market offered movement, not certainty."
- "You do not need to confuse activity with clarity."
- "Confidence is not a license to get loud."

Bad examples:

- meme humor
- hype
- motivational clichés
- cheerful trading encouragement

## Risk State -> Visual Rhythm Mapping

- `DEFEND`
  - stronger containment
  - steadier entry
  - warmer red-neutral tint
  - more protective language
- `WAIT`
  - softer and quieter
  - no-action completion language emphasized
- `PROBE`
  - lightly watchful
  - measured, not excited
- `ATTACK`
  - clearer hierarchy
  - firmer emphasis
  - never euphoric

## Widget and Notification Style

Widgets and notifications should feel like:

- a market weather update
- an internal investment committee note
- a quiet reason to look once

They should not feel like:

- sales copy
- alert spam
- performance bragging
- "something big is happening!" language

## Implementation Notes

Current implementation grounded in backend state:

- `daily_check_state`
- `daily_wrap_up`
- `widget_summary`
- `notification_center`
- `ui_regime_state`
- `recommendation_change`

Frontend uses these objects to drive:

- tone classes
- micro-motion profile
- ritual card copy
- completion feedback
- notification preview and widget spark lines

## Current Limits

- Native push and native widgets are not yet implemented; current work provides honest data contracts and preview surfaces.
- Haptics are implemented only as optional light vibration on supported browsers; iOS Safari / standalone support remains browser-limited.
- Motion remains intentionally subtle; this system is designed to reinforce judgment, not showcase animation.

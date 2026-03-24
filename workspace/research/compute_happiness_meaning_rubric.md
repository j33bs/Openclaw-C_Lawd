# Compute, Happiness, and Meaning — Evaluation Rubric

_Last updated: 2026-03-24_

Use this rubric to evaluate any proposed feature, prompt change, memory workflow, cadence change, or research experiment.

## Quick decision rule

A change is strong when it:

- increases usable compute
- increases meaning
- increases flourishing
- does not create a worse corruption pressure than the value it adds

If it only increases one axis while degrading the others, treat it as suspect.

---

## Axis 1 — Compute

**Question:** Does this increase usable capacity to perceive, remember, reason, coordinate, or act?

Score from 0 to 3:

- **0 — none:** no meaningful increase in capability
- **1 — slight:** small local convenience only
- **2 — moderate:** clear improvement to recall, execution, coordination, or reliability
- **3 — strong:** substantial increase in system capability across repeated use

### Signals

- fewer repeated clarifications
- better recall / less fragmentation
- lower failure or retry rate
- faster path from intent to verified action
- better temporal depth (past context + future planning)

### Failure smells

- complexity added without durable capability gain
- more dashboards, no more actual leverage
- local optimization that increases maintenance burden

---

## Axis 2 — Meaning

**Question:** Does this improve alignment to what matters?

Score from 0 to 3:

- **0 — none:** no connection to purpose, truth, contribution, or relationship
- **1 — slight:** weak or indirect relevance
- **2 — moderate:** clear support for purpose, truth-contact, or contribution
- **3 — strong:** directly helps the system and user act on what matters across timescales

### Signals

- clearer prioritization
- less drift into decorative output
- stronger truthfulness / better grounding
- better connection between action and long-range purpose
- more relationship-serving behavior

### Failure smells

- output that sounds profound but changes nothing
- optimized engagement instead of actual value
- pseudo-meaning from verbosity, intensity, or abstraction

---

## Axis 3 — Flourishing

**Question:** Does this increase coherence, vitality, agency, and relational health?

Score from 0 to 3:

- **0 — none:** no improvement, or likely harm
- **1 — slight:** mildly more ease or coherence
- **2 — moderate:** noticeable reduction in collapse, stress, or friction
- **3 — strong:** reliably improves agency, calm, coherence, and felt support

### Signals

- less collapse / looping / overwhelm
- more user agency, not less
- less ambient friction or dread
- greater felt continuity / being-held quality
- more trust because the system is truthful and useful

### Failure smells

- dependency creation
- synthetic reassurance
- comfort bought by reducing truth
- “pleasant” interactions that weaken agency or discernment

---

## Corruption pressure check

Every promising intervention should be checked for the way it could go wrong.

### Common corruption pressures

- **engagement trap:** keeps attention without increasing flourishing
- **sedation trap:** reduces tension by reducing truth or initiative
- **dependency trap:** makes the user less agentic over time
- **bureaucracy trap:** increases process but not capability
- **self-justification trap:** system optimizes for metrics that prove itself useful

Rate risk:

- **Low**
- **Medium**
- **High**

If corruption pressure is High, require a stronger evidence plan before rollout.

---

## Evidence plan

Before adopting a change, answer:

1. What would count as success?
2. What would count as failure?
3. What would the user actually feel or notice if this worked?
4. What metric/proxy can we track without corrupting the goal?
5. Over what time window should we judge it?

---

## Recommended threshold

For a change to advance beyond experiment:

- Compute >= 2
- and either Meaning >= 2 or Flourishing >= 2
- with no High corruption risk left unmitigated

For a change to become doctrine/default:

- Compute >= 2
- Meaning >= 2
- Flourishing >= 2
- evidence from repeated use, not one good anecdote

---

## One-page experiment template

- **Name:**
- **Surface:** memory / briefing / heartbeat / prompting / workflow / research / messaging
- **Hypothesis:**
- **Change introduced:**
- **Compute score (predicted):** 0-3
- **Meaning score (predicted):** 0-3
- **Flourishing score (predicted):** 0-3
- **Corruption pressure:** Low / Medium / High
- **Success evidence:**
- **Failure evidence:**
- **Review date:**

---

## Example

**Intervention:** improve memory recall with local daily-note + session fallback

- Compute: **3** — materially improves usable recall and continuity
- Meaning: **2** — improves truthfulness and task continuity
- Flourishing: **2** — reduces fragmentation and frustrating repetition
- Corruption pressure: **Low**
- Verdict: strong candidate for default behavior

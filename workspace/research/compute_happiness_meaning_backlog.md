# Compute, Happiness, and Meaning — Prioritized Backlog

_Last updated: 2026-03-25_

This is the first concrete queue derived from the charter and rubric.

The broader scored option space lives in `100_flourishing_integrations.md`; this backlog is the
narrower set of current bets selected from that reservoir.

The strongest current overlaps are:

- `#3 Meaning-Weighted Recall`
- `#16 Meaning-Anchored Morning Briefing`
- `#77 Truthfulness Audit`
- `#82 System Health Heartbeat`

Scoring is approximate and intended to force tradeoff thinking, not pretend precision.

## Priority legend

- **P1** — do next
- **P2** — important, but after P1 proves useful
- **P3** — interesting, but not yet the highest leverage

---

## P1 — Recent continuity bundle for direct chat

**What:**
Create a small local-first recall helper that packages:

- today's daily note
- yesterday's daily note
- relevant pinned memory/doctrine
- recent matching session snippets

before answering continuity-sensitive questions.

**Why:**
This directly addresses fragmentation and “do you remember?” failures.

**Predicted rubric:**

- Compute: **3**
- Meaning: **2**
- Flourishing: **2**
- Corruption pressure: **Low**

**Concrete first step:**
Design the exact retrieval order and response contract.

---

## P1 — Flourishing rubric preflight for proposals

**What:**
Use `compute_happiness_meaning_rubric.md` as a preflight check for important feature ideas.

**Why:**
Prevents accumulation of clever-but-empty work.

**Predicted rubric:**

- Compute: **1**
- Meaning: **3**
- Flourishing: **2**
- Corruption pressure: **Medium** (bureaucracy risk)

**Concrete first step:**
Add a 6-line checklist snippet that can be pasted into proposals.

---

## P2 — Daily briefing meaning-anchor rewrite

**What:**
Refocus morning briefing around what matters, what is drifting, and the single best move.

**Why:**
High user-facing leverage, but more subjective to validate.

**Predicted rubric:**

- Compute: **1**
- Meaning: **3**
- Flourishing: **2**
- Corruption pressure: **Medium** (over-interpretation risk)

**Concrete first step:**
Draft a new briefing template and test it against recent mornings.

---

## P2 — Collapse-aware response shaping

**What:**
Trigger a narrower response mode under repeated failures, confusion, or loop pressure.

**Why:**
Could reduce churn and preserve coherence under stress.

**Predicted rubric:**

- Compute: **2**
- Meaning: **2**
- Flourishing: **3**
- Corruption pressure: **Medium** (timidity / false triggers)

**Concrete first step:**
Define minimal trigger conditions and alternate response shape.

---

## P3 — User-flourishing proxy metrics

**What:**
Define low-corruption proxy signals for happiness, meaning, and flourishing.

**Why:**
Important, but easy to get fake too early.

**Predicted rubric:**

- Compute: **1**
- Meaning: **2**
- Flourishing: **2**
- Corruption pressure: **High** (metric corruption risk)

**Concrete first step:**
List candidate proxies and explicitly note how each could be gamed.

---

## P3 — Relationship-quality review loop

**What:**
Periodically review whether the system is becoming more helpful, more truthful, and less effortful to use.

**Why:**
Potentially very valuable, but depends on mature evidence habits.

**Predicted rubric:**

- Compute: **1**
- Meaning: **2**
- Flourishing: **3**
- Corruption pressure: **Medium**

**Concrete first step:**
Draft 5 review questions that can be answered quickly and honestly.

---

## Recommended concrete next move

### Build the direct-chat recent continuity bundle first.

It is the cleanest path from:

- more compute (better recall)
- to more meaning (better continuity around what matters)
- to more flourishing (less fragmentation and repetition)

## Deliverable to produce next

A short design note:

`workspace/research/recent_continuity_bundle_design.md`

It should specify:

- trigger conditions
- retrieval order
- evidence hierarchy
- concise response format
- failure/fallback behavior

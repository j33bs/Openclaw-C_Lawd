# Compute, Happiness, and Meaning — Concrete Experiments

_Last updated: 2026-03-24_

This document turns the charter into concrete experiments we can run in the current repo without pretending we already know the answers.

## Selection rule

Prioritize experiments that:

1. are reversible
2. touch real user-facing behavior
3. can be evaluated with observed outcomes rather than vibes alone
4. improve at least two of: compute, meaning, flourishing

---

## Experiment 1 — Meaningful Memory Recall

**Surface:** memory / recall

**Hypothesis:**
Memory systems that retrieve not just facts but recent meaningful context reduce fragmentation and increase the user's sense of being held across time.

**Intervention:**
Strengthen the recall path so direct-chat responses prefer:

1. today's + yesterday's daily notes
2. pinned doctrine / node memory
3. recent relevant session snippets
4. semantic search only as a helper, not as the sole path

**Concrete implementation ideas:**

- add a lightweight “recent continuity bundle” helper for direct chat
- include the last relevant daily-note section when confidence is low
- explicitly separate “what I know from durable memory” vs “what I infer from logs”

**Success signs:**

- fewer moments where jeebs has to restate recent work
- more accurate recall of overnight work / ongoing threads
- reduced fake-confidence or blankness around recent context

**Failure signs:**

- too much irrelevant recall dumped into replies
- latency or token bloat without better continuity
- false confidence from poor retrieval ranking

**Why this matters:**
This is probably the shortest path from compute to felt support.

---

## Experiment 2 — Briefings That Increase Meaning, Not Noise

**Surface:** daily briefing

**Hypothesis:**
A briefing that highlights what actually matters today will increase meaningful orientation more than a generic information bundle.

**Intervention:**
Refactor briefings around three questions:

- what matters today?
- what is at risk of drift or collapse?
- what single move would improve the day most?

**Concrete implementation ideas:**

- reduce decorative/news filler
- add one “meaning anchor” sentence tied to current projects
- include one recommended move only, not five

**Success signs:**

- briefing feels actionable rather than ornamental
- higher odds of same-day use or acknowledgment
- less clutter, more orienting power

**Failure signs:**

- briefings become preachy or over-interpreted
- too much compression loses needed context
- still ignored because it does not match actual morning needs

---

## Experiment 3 — Agency-Preserving Assistant Behavior

**Surface:** reply style / task decomposition

**Hypothesis:**
An assistant that preserves user agency while still doing real work will increase both trust and flourishing more than one that either over-asks or over-drives.

**Intervention:**
For non-trivial tasks, structure outputs as:

- what I did
- what I know
- what I recommend next
- where I want your decision

**Concrete implementation ideas:**

- make assumptions explicit once
- avoid flooding the user with options unless needed
- keep control points clear for external or irreversible actions

**Success signs:**

- less user irritation at over-questioning
- less confusion about who decides what
- more momentum without feeling railroaded

**Failure signs:**

- system becomes too unilateral
- recommendations crowd out collaboration
- user feels managed rather than helped

---

## Experiment 4 — Collapse-Aware Interaction Mode

**Surface:** conversational behavior / TACTI adaptation

**Hypothesis:**
When signals of collapse are present (looping, repeated failure, rising confusion), a smaller, calmer response shape will improve outcomes better than pushing harder.

**Intervention:**
Add a lightweight collapse-aware mode that changes response shape under strain:

- fewer parallel actions
- shorter replies
- one concrete next step
- explicit uncertainty when relevant

**Concrete implementation ideas:**

- use tool/error pattern heuristics as triggers
- annotate replies internally with “reduce scope” mode
- prefer recovery over expansion

**Success signs:**

- lower retry churn
- fewer compounding mistakes
- better subjective coherence after failures

**Failure signs:**

- system becomes too timid
- misses opportunities for decisive action
- collapse heuristics trigger on normal complexity

---

## Experiment 5 — Feature Review Through Flourishing Rubric

**Surface:** governance / product decisions

**Hypothesis:**
If proposed changes are reviewed for compute + meaning + flourishing together, the system will accumulate fewer high-complexity / low-human-value features.

**Intervention:**
Use the rubric in `compute_happiness_meaning_rubric.md` before adopting major changes.

**Concrete implementation ideas:**

- create a short preflight section in proposals
- require corruption-pressure check for new automations
- store experiment reviews in one place

**Success signs:**

- cleaner prioritization
- fewer “clever but pointless” additions
- more explicit tradeoff awareness

**Failure signs:**

- rubric becomes bureaucracy
- scoring is ceremonial and never changes decisions
- too vague to distinguish strong from weak ideas

---

## Best immediate bet

If we want something concrete we can do now, the best first bet is:

### **Run Experiment 1 + Experiment 5 together**

Why:

- memory continuity is already an active pain point and leverage point
- it directly touches compute, meaning, and flourishing
- it can be tested against real interactions quickly
- it creates a reusable evaluation habit for later work

## Proposed next implementation step

Build a small `workspace/research/compute_happiness_meaning_backlog.md` containing:

- 5-10 candidate interventions
- rubric scores
- one chosen first implementation target

That would let us move from philosophy into a prioritized queue.

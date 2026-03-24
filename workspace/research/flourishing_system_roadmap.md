# Flourishing Mission — Repo-Grounded System Roadmap

_Last updated: 2026-03-24_

This turns the current flourishing charter into an implementation plan anchored in real repo surfaces.

It is not a fresh philosophy pass. It is a build map for the system that already exists.

## Scope

The mission is:

> use compute in service of human happiness, meaning, and authentic flourishing

The fastest route in this repo is not a giant new subsystem. It is a sequence of changes to memory, prompt contract, briefing cadence, collapse handling, and evidence loops so the system becomes:

- less fragmented
- more truthful
- more agentic
- more continuity-preserving
- easier to use without becoming sedative or dependency-forming

## Existing surfaces to build on

### Memory and continuity

- `src/agents/tools/memory-tool.ts`
- `src/agents/workspace.ts`
- `src/agents/workspace.test.ts`
- `src/agents/system-prompt.ts`
- `nodes/c_lawd/MEMORY.md`
- `memory/*.md`

### Behavioral and orchestration surfaces

- `src/agents/tools/session-status-tool.ts`
- `src/cron/service/timer.ts`
- `src/cron/run-log.ts`
- `src/cron/service/state.ts`
- `src/agents/subagent-announce-queue.ts`
- `src/cron/isolated-agent/run.ts`

### Flourishing and state instrumentation

- `src/flourishing/phase1.ts`
- `src/flourishing/phase1.test.ts`
- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`
- `workspace/evolution/fitness.py`
- `workspace/evolution/memory_health.py`

### Governance and research docs

- `workspace/research/compute_happiness_meaning_charter.md`
- `workspace/research/compute_happiness_meaning_rubric.md`
- `workspace/research/compute_happiness_meaning_backlog.md`
- `workspace/research/compute_happiness_meaning_experiments.md`
- `workspace/research/README.md`
- `workspace/governance/HEARTBEAT.md`

---

## The 10 proposed system changes

## 1) Recent continuity bundle for direct chat

**Goal:** reduce "you forgot" / "I already told you" failures.

**Primary repo surfaces:**

- `src/agents/tools/memory-tool.ts`
- `src/agents/workspace.ts`
- `src/agents/system-prompt.ts`

**Implementation shape:**

- create a single continuity helper that assembles:
  - today + yesterday daily notes
  - pinned node doctrine
  - recent relevant session snippets
  - semantic recall only after those local sources
- return a bounded, ranked bundle rather than raw search spray

**Why first:** highest leverage path from capability -> meaning -> reduced fragmentation.

---

## 2) Continuity-sensitive response contract

**Goal:** make the assistant explicitly distinguish remembered facts, recent-log context, and inference.

**Primary repo surfaces:**

- `src/agents/system-prompt.ts`
- `nodes/c_lawd/CONVERSATION_KERNEL.md`
- `src/agents/tools/memory-tool.ts`

**Implementation shape:**

- for continuity-sensitive turns, standardize reply structure:
  - what I found
  - what I infer
  - what is still uncertain
- encourage short citation-bearing continuity answers in direct chat

**Risk addressed:** fake confidence from weak retrieval.

---

## 3) Local-first evidence ladder for recall

**Goal:** keep semantic memory helpful without letting it become the only truth source.

**Primary repo surfaces:**

- `src/agents/tools/memory-tool.ts`
- `src/agents/tools/memory-tool.local-fallback.test.ts`
- `src/agents/workspace.test.ts`

**Implementation shape:**

- codify retrieval order as doctrine and tests:
  1. local recent daily notes
  2. pinned node docs
  3. recent session snippets
  4. semantic matches
- add explicit mode markers like `local-first`, `session-backed`, `semantic-only`

**Risk addressed:** brittle recall when embeddings degrade or ranking is noisy.

---

## 4) Anti-fragmentation detector

**Goal:** detect when continuity is degrading before the user has to complain.

**Primary repo surfaces:**

- `src/flourishing/phase1.ts`
- `workspace/evolution/fitness.py`
- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`

**Implementation shape:**

- score fragmentation pressure from a small set of signals:
  - recall success / failure
  - duplicate clarification rate
  - freshness of daily notes
  - presence of continuity bundle coverage
  - unresolved drift signals
  - cross-surface truth mismatch
- produce a bounded severity (`low`, `elevated`, `high`, `critical`) plus next actions

**First artifact landed in this branch:** `src/flourishing/anti-fragmentation.ts`

---

## 5) Meaning-anchor briefing rewrite

**Goal:** briefings should orient action, not just summarize noise.

**Primary repo surfaces:**

- `workspace/governance/HEARTBEAT.md`
- `src/cron/service/timer.ts`
- `src/cron/run-log.ts`

**Implementation shape:**

- for briefing-like jobs, bias output toward:
  - what matters today
  - what is drifting / at risk
  - one best next move
- keep decorative filler out

**Risk addressed:** output volume without lived usefulness.

---

## 6) Collapse-aware response shaping

**Goal:** when confusion/failure pressure rises, narrow scope instead of thrashing harder.

**Primary repo surfaces:**

- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`
- `src/cron/service/state.ts`
- `src/agents/system-prompt.ts`

**Implementation shape:**

- trigger a smaller response mode under repeated failures or rising churn:
  - shorter replies
  - one next step
  - less fan-out
  - more explicit uncertainty

**Risk addressed:** compounding mistakes during strain.

---

## 7) Agency-preserving task handoff contract

**Goal:** do real work without either over-asking or railroading.

**Primary repo surfaces:**

- `src/cron/isolated-agent/run.ts`
- `src/agents/subagent-announce-queue.ts`
- `nodes/c_lawd/CONVERSATION_KERNEL.md`

**Implementation shape:**

- standardize non-trivial outputs around:
  - what I did
  - what I know
  - what I recommend
  - what needs your decision
- use this for direct chat and subagent completion summaries

**Risk addressed:** loss of agency through ambiguity or overdrive.

---

## 8) Proposal / feature preflight using the flourishing rubric

**Goal:** block clever-but-empty work from becoming default roadmap gravity.

**Primary repo surfaces:**

- `workspace/research/compute_happiness_meaning_rubric.md`
- `workspace/evolution/PROPOSALS.md`
- `workspace/research/README.md`

**Implementation shape:**

- add a tiny preflight template for major proposals:
  - compute delta
  - meaning delta
  - flourishing delta
  - corruption pressure
  - evidence plan
- require this for large workflow/product changes

**Risk addressed:** bureaucracy-free but real prioritization.

---

## 9) Flourishing instrumentation pipeline

**Goal:** turn flourishing from a slogan into a trackable state surface.

**Primary repo surfaces:**

- `src/flourishing/phase1.ts`
- `workspace/memory/tacti_core.py`
- `workspace/evolution/fitness.py`

**Implementation shape:**

- connect existing five-axis flourishing records to repo-level reporting
- start with observational/manual or derived metrics, not fake precision
- include weakest-axis reporting and trend windows

**Risk addressed:** vague mission with no operational feedback loop.

---

## 10) Cross-surface drift receipting

**Goal:** make truth mismatches visible when backend state and user-facing claims diverge.

**Primary repo surfaces:**

- `nodes/c_lawd/MEMORY.md`
- `src/agents/system-prompt.ts`
- `src/cron/run-log.ts`
- Source UI / backlog flows already referenced in `TOOLS.md`

**Implementation shape:**

- for stateful claims, require receipts, ids, or evidence class
- record drift incidents where user-visible state and backend truth disagree
- feed those incidents into the anti-fragmentation detector

**Risk addressed:** trust erosion from subtle cross-surface inconsistency.

---

## Recommended phases

## Phase A — Continuity foundation

Build first:

1. recent continuity bundle
2. continuity-sensitive response contract
3. local-first evidence ladder
4. anti-fragmentation detector

**Exit condition:** continuity-sensitive turns become measurably less fragmented.

## Phase B — Interaction shaping

Build next: 5. meaning-anchor briefing rewrite 6. collapse-aware response shaping 7. agency-preserving task handoff contract

**Exit condition:** lower churn, lower confusion, more useful summaries.

## Phase C — Governance and measurement

Build after that: 8. proposal preflight 9. flourishing instrumentation pipeline 10. cross-surface drift receipting

**Exit condition:** roadmap discipline and trend visibility exist without metric theater.

---

## Build order recommendation

### Immediate next build

**Ship the direct-chat continuity stack first:**

- continuity bundle
- continuity-sensitive response contract
- anti-fragmentation detector wired in observation mode

That is the smallest believable slice with user-facing payoff.

### Why not start with metrics or briefing polish?

Because the biggest current failure mode is fragmentation, not lack of dashboards.

If continuity is weak, everything else becomes ornamental.

---

## Success criteria for the roadmap

Within the first implementation cycle, we should be able to show:

- fewer continuity failures in direct chat
- fewer repeated user restatements of recent context
- better explicit epistemic labeling in memory-sensitive replies
- a detector output that flags fragmentation pressure before it becomes severe
- a backlog that can be built in sequence without inventing a parallel architecture

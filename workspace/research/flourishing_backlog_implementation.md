# Flourishing Mission — Prioritized Implementation Backlog

_Last updated: 2026-03-24_

This backlog converts the roadmap into concrete build slices with repo anchors.

## Priority legend

- **Now** — next build slice
- **Soon** — immediately after the current slice proves useful
- **Later** — important, but not first

---

## Now

## F1 — Direct-chat recent continuity bundle

**Outcome:** one bounded helper for continuity-sensitive turns.

**Repo anchors:**

- `src/agents/tools/memory-tool.ts`
- `src/agents/workspace.ts`
- `src/agents/system-prompt.ts`

**Tasks:**

- define trigger conditions for a continuity-sensitive turn
- implement a bundling helper that orders local sources before semantic recall
- cap output size so continuity improves without prompt sprawl
- emit source mode metadata (`local-first`, `session-backed`, `semantic-only`)

**Definition of done:**

- helper exists
- tests cover ordering and fallback behavior
- direct-chat prompt contract can mention the bundle cleanly

---

## F2 — Continuity reply contract

**Outcome:** answers about prior work separate memory, inference, and uncertainty.

**Repo anchors:**

- `src/agents/system-prompt.ts`
- `nodes/c_lawd/CONVERSATION_KERNEL.md`

**Tasks:**

- add a short continuity-answer format instruction
- keep it direct-chat friendly, not verbose
- ensure it does not leak into every normal turn

**Definition of done:**

- prompt text updated
- examples added in design docs
- no obvious token bloat regression

---

## F3 — Anti-fragmentation detector v0

**Outcome:** repo-local signal for continuity breakdown risk.

**Repo anchors:**

- `src/flourishing/anti-fragmentation.ts`
- `src/flourishing/anti-fragmentation.test.ts`
- later: `workspace/evolution/fitness.py`

**Tasks:**

- define detector input schema
- score fragmentation severity
- emit concise recommendations
- keep it observation-only for first rollout

**Definition of done:**

- detector module exists
- tests cover low-risk and high-risk cases
- roadmap docs reference it as the monitoring primitive

---

## F4 — Recent continuity bundle design note

**Outcome:** implementation can proceed without re-arguing the retrieval contract.

**Repo anchors:**

- `workspace/research/recent_continuity_bundle_design.md`

**Tasks:**

- document retrieval order
- document fallback behavior
- document evidence hierarchy
- document concise reply shape

**Definition of done:**

- design note exists and matches current code direction

---

## Soon

## F5 — Meaning-anchor briefing rewrite

**Repo anchors:**

- `workspace/governance/HEARTBEAT.md`
- `src/cron/service/timer.ts`
- `src/cron/run-log.ts`

**Tasks:**

- define a three-line briefing shape
- detect whether a cron job is a briefing-like surface
- log whether the briefing produced a recommended move

---

## F6 — Collapse-aware response mode

**Repo anchors:**

- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`
- `src/cron/service/state.ts`

**Tasks:**

- define churn / failure heuristics
- add a narrow-mode recommendation surface
- ensure normal complex tasks do not false-trigger collapse mode

---

## F7 — Agency-preserving handoff summaries

**Repo anchors:**

- `src/cron/isolated-agent/run.ts`
- `src/agents/subagent-announce-queue.ts`

**Tasks:**

- normalize subagent and isolated-run summaries
- preserve receipts and next actions
- mark explicit decision points for the user

---

## Later

## F8 — Proposal preflight template

**Repo anchors:**

- `workspace/research/compute_happiness_meaning_rubric.md`
- `workspace/evolution/PROPOSALS.md`

**Tasks:**

- add a copy-paste proposal block
- require corruption-pressure note for larger changes

---

## F9 — Flourishing instrumentation rollup

**Repo anchors:**

- `src/flourishing/phase1.ts`
- `workspace/evolution/fitness.py`

**Tasks:**

- connect five-axis summaries to a higher-level trend report
- keep observational mode separate from any stronger claims

---

## F10 — Cross-surface drift receipts

**Repo anchors:**

- `nodes/c_lawd/MEMORY.md`
- `src/agents/system-prompt.ts`
- `src/cron/run-log.ts`

**Tasks:**

- define drift incident format
- log receipt-less state claims as risk events
- feed those into detector inputs later

---

## F11 — Flourishing proxy review

**Repo anchors:**

- `workspace/research/compute_happiness_meaning_rubric.md`
- `workspace/research/compute_happiness_meaning_experiments.md`

**Tasks:**

- list low-corruption proxies
- document how each can be gamed
- keep proxies secondary to direct evidence

---

## Dependency map

- **F1** unlocks **F2** and strengthens **F3**
- **F3** should exist before **F5/F6**, so later changes can be observed rather than vibe-judged
- **F5/F6/F7** can proceed in parallel once F1-F3 are stable
- **F8-F11** should follow after real interaction evidence exists

## Recommended next build order

1. **F4** design note
2. **F3** anti-fragmentation detector v0
3. **F1** continuity bundle implementation
4. **F2** continuity reply contract
5. **F5** briefing rewrite
6. **F6** collapse-aware mode
7. **F7** handoff summaries
8. **F8-F11** governance + metrics layer

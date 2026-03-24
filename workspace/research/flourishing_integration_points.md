# Flourishing Mission — Suggested Integration Points

_Last updated: 2026-03-24_

This is the shortest map from the roadmap to concrete repo touchpoints.

## Direct chat continuity

### Add/extend

- `src/agents/tools/memory-tool.ts`
- `src/agents/system-prompt.ts`
- `src/agents/workspace.ts`

### Why here

These files already define memory retrieval, prompt guidance, and bootstrap context.

### Integrate by

- adding a continuity-bundle helper close to the memory tool path
- surfacing continuity mode metadata
- teaching the direct-chat prompt when to use the bundle

---

## Bootstrap and local evidence

### Add/extend

- `src/agents/workspace.test.ts`
- `src/agents/tools/memory-tool.local-fallback.test.ts`

### Why here

These tests already protect the exact local-first continuity surfaces the roadmap depends on.

### Integrate by

- extending tests for retrieval ordering
- extending tests for degraded semantic-memory conditions

---

## Collapse / churn sensing

### Add/extend

- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`
- `src/cron/service/state.ts`

### Why here

These files already encode arousal/activity state and cron execution state.

### Integrate by

- defining a small churn/failure summary
- passing it into response-shaping or detector logic

---

## Flourishing metrics and fragmentation sensing

### Add/extend

- `src/flourishing/phase1.ts`
- `src/flourishing/anti-fragmentation.ts`
- `workspace/evolution/fitness.py`

### Why here

`src/flourishing` already contains typed flourishing primitives. `fitness.py` is the existing repo health rollup.

### Integrate by

- keeping anti-fragmentation as a typed primitive in `src/flourishing`
- exposing a higher-level snapshot later in `fitness.py`

---

## Briefings and daily orientation

### Add/extend

- `workspace/governance/HEARTBEAT.md`
- `src/cron/service/timer.ts`
- `src/cron/run-log.ts`

### Why here

These are the live cadence surfaces for periodic orientation and delivery summaries.

### Integrate by

- rewriting briefing output shape
- recording whether a briefing produced a single recommended move

---

## Governance / proposal discipline

### Add/extend

- `workspace/research/compute_happiness_meaning_rubric.md`
- `workspace/evolution/PROPOSALS.md`
- `workspace/research/README.md`

### Why here

The research docs already hold the evaluation framework; `PROPOSALS.md` is the natural gate for larger changes.

### Integrate by

- adding a lightweight preflight snippet
- linking it from proposal-writing surfaces

---

## Subagent / isolated-run summaries

### Add/extend

- `src/agents/subagent-announce-queue.ts`
- `src/cron/isolated-agent/run.ts`

### Why here

These are the existing summary/handoff surfaces where agency-preserving structure can be standardized.

### Integrate by

- shaping outputs around done / known / recommend / decide
- preserving receipts in summaries instead of flattening them away

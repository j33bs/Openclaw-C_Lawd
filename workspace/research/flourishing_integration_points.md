# Flourishing Mission — Suggested Integration Points

_Last updated: 2026-03-25_

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

---

## Relational / TACTI deepening

### Add/extend

- `workspace/memory/tacti_core.py`
- `workspace/memory/tracker_adapters.py`
- `workspace/memory/relationship_tracker.py`
- `workspace/memory/relationship.json`
- `nodes/c_lawd/CONVERSATION_KERNEL.md`
- `src/agents/flourishing-response-shaping.ts`

### Why here

These surfaces already carry arousal, relational, and response-shaping state. They are the right
place to ground repair tracking, bid awareness, disagreement, flow protection, and co-regulation.

### Integrate by

- recording observable relational signals instead of inventing psychologized state
- extending response-shaping with repair / trust / silence-aware paths
- keeping relational doctrine tied to tracked interaction receipts

---

## Knowledge / learning loops

### Add/extend

- `workspace/knowledge_base/kb.py`
- `workspace/knowledge_base/retrieval.py`
- `workspace/knowledge_base/indexer.py`
- `workspace/knowledge_base/README.md`
- `src/memory/*`
- `workspace/research/*`

### Why here

These are the repo's live knowledge, retrieval, and research surfaces. They are where spaced
repetition, confidence mapping, concept maturity, and knowledge-decay checks should land.

### Integrate by

- ranking retrieval by current meaning and maturity, not novelty alone
- tracking confidence and staleness on important knowledge surfaces
- turning failure and exploration into explicit learning-loop artifacts

---

## Creative / expressive surfaces

### Add/extend

- `src/agents/tools/tts-tool.ts`
- `src/tts/*`
- `extensions/voice-call/src/*`
- `workspace/memory/tonights_story.md`
- `src/tui/components/markdown-message.ts`

### Why here

These are the existing repo surfaces for voice, narration, and expressive delivery. They support
storytelling, writing-partner, and visual-thinking work without inventing a new subsystem.

### Integrate by

- using voice and writing modes to deepen reflection rather than replace substance
- keeping expressive features tied to real memory, research, or drafting tasks
- treating visual support as a reasoning aid, not a decorative layer

---

## Physical / embodiment surfaces

### Add/extend

- `workspace/memory/arousal_tracker.py`
- `workspace/memory/arousal_state.json`
- `workspace/memory/tacti_core.py`
- `src/infra/heartbeat-runner.ts`
- `src/cron/service/*`

### Why here

The repo already has arousal and cadence surfaces. They are the correct first landing zone for
embodiment-aware behavior before any new health, location, or home-automation connectors exist.

### Integrate by

- using current arousal and timing signals before adding more invasive ones
- gating any future body/location/environment signals behind explicit consent
- keeping embodiment work focused on regulation and rhythm, not surveillance

---

## Social / relationship support

### Add/extend

- `workspace/memory/relationship_tracker.py`
- `extensions/telegram/src/*`
- `extensions/discord/src/monitor/*`
- `extensions/imessage/src/monitor/*`
- `src/channels/thread-bindings-messages.ts`
- `src/infra/outbound/message-action-runner.ts`

### Why here

The system already has relationship memory and multi-channel messaging surfaces. Social support
should layer onto those rather than becoming a detached CRM-like subsystem.

### Integrate by

- grounding relationship help in recent interaction history and explicit user direction
- using existing messaging channels for preparation, reminders, and follow-through
- keeping consent, boundaries, and non-metricized care as the default posture

# EVOLUTION_LOG.md — Growth Journal

_A record of how the system changes over time: what changed, why, and what was learned._

---

## Format

```
### YYYY-MM-DD — [change type] Title
**Proposal:** P-NNN (or "spontaneous")
**Changed:** What was actually modified.
**Why it mattered:** The signal or problem it addressed.
**Outcome:** What improved (or didn't).
**Lesson:** What this taught the system about itself.
```

---

## Log

### 2026-03-23 — [memory-health] Folded heartbeat state and session exports into health checks

**Proposal:** spontaneous (continuation of `workspace/evolution/200_IMPROVEMENTS.md` implementation)
**Changed:** Extended `memory_health.py` so heartbeat state and session-export files are tracked by the same freshness, status, and audit surfaces as the rest of memory. Updated the helper tests to cover the expanded store set.
**Why it mattered:** The earlier health tooling still had blind spots: heartbeat state had its own helper, and session exports existed on disk, but neither showed up in the operator-facing health report. That left meaningful memory surfaces outside the main diagnostics loop.
**Outcome:** `memory_status.py`, `memory_audit.py`, and `fitness.py` can now surface stale heartbeat state and session-export freshness directly, instead of treating them as invisible side files.
**Lesson:** New helpers only become operationally useful once they are folded back into the main observability surface. Otherwise the system keeps creating more edges than it actually sees.

### 2026-03-23 — [heartbeat-state] Added a managed heartbeat-state helper and CLI

**Proposal:** spontaneous (continuation of `workspace/evolution/200_IMPROVEMENTS.md` implementation)
**Changed:** Added `workspace/memory/heartbeat_state.py` for loading, saving, touching, and querying `memory/heartbeat-state.json`, backed by the shared atomic verified writer. Added focused unit coverage for the state contract.
**Why it mattered:** `memory/heartbeat-state.json` was documented doctrine but not a managed code surface. That meant the file could exist without any reliable, reusable update path, undermining the heartbeat discipline it was meant to support.
**Outcome:** Heartbeat state now has a concrete module and CLI entry point. Future heartbeat automation can read or update that file through one audited path instead of ad-hoc writes.
**Lesson:** If a file is part of doctrine, it should also have a canonical code path. Otherwise the system ends up documenting a behavior more strongly than it implements it.

### 2026-03-23 — [memory-recall] Added a lightweight session replay index

**Proposal:** spontaneous (continuation of `workspace/evolution/200_IMPROVEMENTS.md` implementation)
**Changed:** Added `workspace/evolution/session_replay_index.py`, which indexes date-named daily logs into `date + topics + excerpt` entries and supports direct query lookup from the command line.
**Why it mattered:** Recent memory digests were useful, but they still required manually scanning output. The next leverage step was a direct lookup surface for "when did we discuss X?" that works from the existing daily logs without a new database layer.
**Outcome:** Daily memory now has a lightweight replay index. Querying terms like `mlx` or `Source` can return matching session dates immediately from indexed topics/excerpts.
**Lesson:** Fast recall does not always require a new store. A small index over disciplined file naming gets most of the retrieval value with almost no architectural cost.

### 2026-03-23 — [memory-hardening] Switched runtime memory writes to atomic verified persistence

**Proposal:** spontaneous (continuation of `workspace/evolution/200_IMPROVEMENTS.md` implementation)
**Changed:** Added `workspace/memory/io_utils.py` with atomic write + read-back verification helpers, then routed `arousal_tracker.py`, `relationship_tracker.py`, `pattern_chunker.py`, `event_notifier.py`, and `session_handshake.py` through that shared path.
**Why it mattered:** Several live memory surfaces were still doing direct overwrite writes. That left the state layer exposed to truncation or partial-write failure modes and made the memory improvement work less trustworthy than it looked from the reporting side.
**Outcome:** The core JSON/text memory writers now use temp-file write, fsync, rename, and immediate read-back verification. The write path is more reversible, auditable, and aligned with the improvement doc without changing external contracts.
**Lesson:** Reporting and integrity checks are only half the loop. Once the system can see a memory surface clearly, the next leverage point is making the write path match the standards the diagnostics expect.

### 2026-03-23 — [memory-health] Added audit, status, summary, and freshness indexing

**Proposal:** spontaneous (implementation batch from `workspace/evolution/200_IMPROVEMENTS.md`)
**Changed:** Added `workspace/evolution/memory_health.py`, `memory_audit.py`, `memory_status.py`, and `memory_summary.py`. Extended `fitness.py` with a memory freshness index sourced from the same helper layer. Added focused unit coverage for the new helper behavior.
**Why it mattered:** The repo had a growing memory surface but no single executable way to answer basic questions like "which memory stores are stale?", "is the current memory state structurally intact?", or "what happened in the last 7 days?" without manually opening raw files.
**Outcome:** Memory health now has executable checks and a low-churn operator surface. Freshness drift is visible in fitness output, and recent-memory summaries can be generated without dragging raw logs into interactive context.
**Lesson:** Small operator tools close a lot of observability gaps without forcing an architectural rewrite. Shared helper logic kept the diff reversible and made the freshness/audit/status views consistent.

### 2026-03-21 — [scaffolding] Self-evolution layer bootstrapped

**Proposal:** spontaneous (jeebs: "help the codebase to be a self-evolving organism")
**Changed:** Created `workspace/evolution/` with `fitness.py`, `PROPOSALS.md`, `EVOLUTION_LOG.md`. Updated `HEARTBEAT.md` with evolution checks. Added self-evolution principle to `SOUL.md`.
**Why it mattered:** The system could track relational/cognitive state (TACTI) and episodic memory (daily logs) but had no structural self-awareness — no way to observe its own codebase health, surface improvement proposals, or close the sense→assess→propose→act loop at the code level.
**Outcome:** Sensing layer bootstrapped. First fitness run will establish baseline. Proposal queue is open.
**Lesson:** A system that can't see itself can't grow intentionally. The organism needed eyes turned inward before it could evolve outward.

---

_This file is yours. Write in it when something significant shifts._

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

### 2026-03-24 — [kb-backend] Added a real local KB backend with Ollama embeddings and sqlite storage

**Proposal:** spontaneous
**Changed:** Added `workspace/knowledge_base/chunking.py`, `embeddings/driver_ollama.py`, `indexer.py`, `retrieval.py`, `vector_store.py`, `vector_store_lancedb.py`, and `kb.py` so the repo-local knowledge base can sync and search through a real local Ollama + sqlite backend. Updated KB health/reporting/docs to treat that backend as the live path, added focused unit coverage, and marked `data/kb.sqlite3` as a local rebuildable artifact instead of tracked source.
**Why it mattered:** The earlier work made the KB honest, but still weak. The repo could say “seed-only” correctly and refresh the compatibility corpus, yet there was still no real local vector backend behind it. That left recall infrastructure structurally better described than implemented.
**Outcome:** `python3 workspace/knowledge_base/kb.py sync --json` now builds a real local backend and `kb.py search` returns results from it. `kb_status.py`, `memory_status.py`, `memory_audit.py`, and `fitness.py` can now distinguish between a maintained local backend and a bare seed corpus.
**Lesson:** Once diagnostics stop lying, the next leverage point is a small real backend, not more prose about the missing one. Honest observability should lead directly to the smallest viable implementation that makes the warnings false.

### 2026-03-24 — [kb-runtime] Added a local KB compatibility refresh path and runtime gate

**Proposal:** spontaneous
**Changed:** Added `workspace/knowledge_base/refresh_seed.py` to rebuild `workspace/knowledge_base/data/entities.jsonl` plus `last_sync.txt` from durable local docs, and gated `workspace/memory/unified_query.js` so the compatibility `vector_store` adapter stays silent until that corpus has a real sync receipt and more than the single baked-in seed row. Added focused Python and Vitest coverage and documented the new refresh command.
**Why it mattered:** The repo-local KB had become honest in diagnostics, but still weak in operation: there was no production writer for the compatibility corpus, and the read path still treated a one-row seed file as a live vector source. That left the subsystem half-correct in prose and half-fictional in runtime behavior.
**Outcome:** The compatibility KB can now be refreshed locally on purpose, and the legacy adapter only exposes it once the corpus is actually maintained. The MLX pipeline is still absent, but the runtime no longer pretends the seed file alone is a usable vector store.
**Lesson:** If a compatibility layer exists, give it a small real maintenance path and gate its read surface on that path. Otherwise the system keeps shipping placeholders that look more operational than they are.

### 2026-03-24 — [kb-health] Added explicit knowledge-base and MLX health reporting

**Proposal:** spontaneous
**Changed:** Added `workspace/evolution/knowledge_base_health.py` and `kb_status.py`, integrated KB/MLX status into `fitness.py`, folded the same KB truth into `memory_health.py`/`memory_status.py`/`memory_audit.py`, added focused unit coverage, and corrected stale docs so the repo now describes `workspace/knowledge_base/` as a compatibility seed rather than an implied live MLX pipeline.
**Why it mattered:** The repo had drift between memory notes and reality: the top-level KB tree was just seed data, but older notes and docs still implied `kb.py`, `indexer.py`, and `driver_mlx.py` existed. That made the weak spot hard to reason about honestly.
**Outcome:** Operators can now ask one question, get one answer: the current KB surface is seed-only, its sync timestamp is explicit, and any missing MLX/runtime pieces show up directly in `kb_status.py`, `fitness.py`, and the main memory status/audit surfaces.
**Lesson:** When a subsystem is weak, the first honest improvement is to make its actual state explicit. Otherwise memory and docs accumulate fiction faster than code catches up.

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

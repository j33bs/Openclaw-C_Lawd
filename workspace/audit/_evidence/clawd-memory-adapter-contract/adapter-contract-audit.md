# C_Lawd Memory Adapter Contract Audit

Date: 2026-03-18
Branch: `codex/refactor/clawd-memory-adapter-contract`
Base: `codex/refactor/clawd-memory-seam-hardening`

## Previous Implicit Contract

Before this pass, `workspace/memory/tacti_core.py` expected these class-shaped symbols to exist:

- `relationship_tracker.RelationshipTracker`
- `arousal_tracker.ArousalTracker`
- `pattern_chunker.PatternChunker`

Only `PatternChunker` existed. The relationship and arousal modules exposed functional state/event helpers instead:

- `relationship_tracker.load_state(...)`
- `relationship_tracker.update_from_event(...)`
- `relationship_tracker.record_session_open(...)`
- `relationship_tracker.record_session_close(...)`
- `arousal_tracker.load_state(...)`
- `arousal_tracker.update_from_event(...)`

That meant `workspace.memory.tacti_core` could import, but `TacticCore()` still failed because the expected tracker classes were not implemented anywhere.

## New Explicit Adapter Contract

This pass adds `workspace/memory/tracker_adapters.py` as the explicit class-shaped seam contract for `tacti_core.py`.

### Relationship Adapter

- Class: `RelationshipTracker`
- Backing functions:
  - `relationship_tracker.load_state(...)`
  - `relationship_tracker.update_from_event(...)`
- Methods exposed to `tacti_core.py`:
  - `record_interaction(interaction_type, sentiment=0.5, resolution="success")`
  - `record_insight(insight)`
  - `get_health()`

### Arousal Adapter

- Class: `ArousalTracker`
- Backing functions:
  - `arousal_tracker.load_state(...)`
  - `arousal_tracker.update_from_event(...)`
- Methods exposed to `tacti_core.py`:
  - `record_message(token_count=0, tool_calls=0, tool_failures=0)`
  - `get_state()`

### `tacti_core.py` Contract Use

- `tacti_core.py` now resolves `RelationshipTracker` and `ArousalTracker` from `tracker_adapters.py`, not from the tracker state modules.
- `TacticCore(...)` now accepts optional `repo_root` and `session_id` injection, which preserves default behavior while making the seam easier to exercise and extract later.

## Files / Classes / Functions Involved

- `workspace/memory/tracker_adapters.py`
  - `RelationshipTracker`
  - `ArousalTracker`
  - `DEFAULT_SESSION_ID`
- `workspace/memory/tacti_core.py`
  - `TacticCore.__init__(repo_root=None, session_id="tacti_core")`
- `workspace/memory/BOUNDARY.md`
  - updated to record that the adapter layer now exists explicitly

## Blocker Resolved

- Resolved: `tacti_core.py` no longer depends on implicit tracker class shapes that do not exist in `relationship_tracker.py` and `arousal_tracker.py`.
- Result: `TacticCore()` can now instantiate and produce status output using the explicit adapter layer.

## Blockers Remaining

- `message_hooks.py` and `session_handshake.py` still depend on the direct functional tracker seam; they were not moved to the class adapters in this pass because that would widen scope.
- `unified_query.js` still defaults to wider repo-owned governance, knowledge-base, and profile sources.
- Engine-candidate files still physically live under `workspace/memory/`.

## Extraction Feasibility

Physical extraction from `workspace/memory/` is now more feasible than before because the `tacti_core.py` tracker dependency is explicit and localized. It is not yet cleanly extractable because:

- the functional tracker seam is still local to `workspace/memory/`
- `message_hooks.py` and `session_handshake.py` still depend on those local tracker modules directly
- `unified_query.js` still assumes wider repo-owned data sources unless callers override them

## Validation

- `python3 -m py_compile workspace/memory/tracker_adapters.py workspace/memory/tacti_core.py` -> passed
- Import smoke for `workspace.memory.tracker_adapters` and `workspace.memory.tacti_core` -> passed
- `TacticCore().full_status()` -> passed
- Tempdir-backed smoke:
  - `TacticCore(repo_root=<tmp>, session_id="smoke-session").record_interaction(...)`
  - `record_insight(...)`
  - `update_arousal(...)`
  - expected state files were created under `<tmp>/workspace/state_runtime/memory/`
- `git diff --check` -> clean

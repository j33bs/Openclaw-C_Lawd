# Workspace Memory Boundary

This subtree now has an explicit boundary classification, but it was not physically reorganized in this pass.

## Why files were not moved

- Several modules import each other directly inside `workspace/memory/`.
- Several modules hard-code `workspace/memory/...`, `memory/...`, or `workspace/state_runtime/memory/...` paths.
- `MEMORY.md` and prior audit docs already reference the current filenames and locations.
- Moving files now would therefore create avoidable breakage or stale references, which is outside a low-risk boundary pass.

## keep_in_clawd

- `EVOLUTION.md`
- `c_lawd_reflection.md`
- `tonights_story.md`
- `arousal_state.json`
- `events.json`
- `relationship.json`
- `tacticr_feedback.jsonl`
- `pause_check.py`

## candidate_for_shared_source

- `tacti_core.py`
- `relationship_tracker.py`
- `arousal_tracker.py`
- `context_compactor.py`
- `conversation_summarizer.py`
- `event_notifier.py`
- `message_parser.py`
- `pattern_chunker.py`
- `unified_query.js`

## unresolved

- `.gitkeep`
- `message_hooks.py`
- `session_handshake.py`

## Proposed future moves

- `keep_in_clawd` -> `workspace/memory/policy/`
- `candidate_for_shared_source` -> `workspace/memory/engine_candidates/` or a later shared-source home
- `unresolved` -> `workspace/memory/unresolved/` until the import and event-contract questions are settled

## Current decision

- Keep current paths stable.
- Use this file and the linked evidence bundle as the source of truth for the boundary until callers and path literals are made movable.
- Shared-engine candidates now prefer helper-based path resolution where it was low-risk to do so.
- `tacti_core.py` now resolves sibling modules lazily so package imports do not depend on the current file layout at import time, but the class-shaped tracker adapter contract still blocks physical extraction.
- `message_hooks.py` and `session_handshake.py` now support both package-relative and local-script imports; `session_handshake.py` also prefers root identity docs with a workspace fallback for compatibility.
- `unified_query.js` still has broader repo-wide adapters, but those defaults are now explicit compatibility defaults instead of hidden path literals.

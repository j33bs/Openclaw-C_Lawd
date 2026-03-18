# Workspace Memory Usage Audit

This audit searched the repo for direct `workspace/memory/...` references, symbol/file-name references, and intra-directory imports.

## Summary decision

- No files were moved in this pass.
- External repo usage is currently light.
- Internal coupling inside `workspace/memory/` is non-trivial enough that moving files now would risk breakage or stale path references.

## Per-file audit

| File | Imported by / referenced by | Move now appears safe? | Extraction blocker? | Notes |
| --- | --- | --- | --- | --- |
| `.gitkeep` | no in-repo references found | yes, but low value | no | Repo housekeeping only. |
| `EVOLUTION.md` | no external references found | yes from a runtime perspective; not worth isolated churn | no | Content contains example paths such as `memory/relationship.json`. |
| `arousal_state.json` | `context_compactor.py` path literal; `arousal_tracker.py` writes related runtime state under `workspace/state_runtime/memory/` | no | yes | Data location is already baked into code expectations. |
| `arousal_tracker.py` | `tacti_core.py` imports `ArousalTracker`; `message_hooks.py` imports `update_from_event`; `MEMORY.md` names it | no | yes | Shared-engine candidate, but current location is referenced by code and docs. |
| `c_lawd_reflection.md` | no in-repo references found | yes from a runtime perspective; not worth isolated churn | no | C_Lawd-local continuity document. |
| `context_compactor.py` | no external imports found; hard-codes `workspace/memory/arousal_state.json` | no | yes | Candidate for shared engine, but path literal makes relocation unsafe without refactor. |
| `conversation_summarizer.py` | no in-repo references found | no | yes | Uses `memory/` as an implicit input root. |
| `event_notifier.py` | no external imports found; hard-codes `workspace/memory/events.json` | no | yes | Candidate for shared engine, but state path is fixed. |
| `events.json` | `event_notifier.py` path literal | no | yes | Data file tied to current code path. |
| `message_hooks.py` | no external references found; imports `.arousal_tracker` and `.relationship_tracker` | no | yes | Unresolved because it couples event plumbing to tracker modules. |
| `message_parser.py` | no external references found | probably yes, but no inert reorg value | no | Engine-like but currently unused in-repo. |
| `pattern_chunker.py` | `tacti_core.py` imports `PatternChunker`; hard-codes `memory/` and `workspace/memory/shortcuts.json` | no | yes | Internal import plus path literals. |
| `pause_check.py` | no external references found | probably yes, but keep local behavior stable | no | C_Lawd-local policy/heuristic surface. |
| `relationship.json` | `EVOLUTION.md` references `memory/relationship.json` | no | yes | Current content/docs already disagree on exact location; moving now would add churn without fixing ownership. |
| `relationship_tracker.py` | `tacti_core.py` imports `RelationshipTracker`; `message_hooks.py` and `session_handshake.py` import helper functions; `MEMORY.md` names it | no | yes | Shared-engine candidate with active internal coupling. |
| `session_handshake.py` | no external references found; imports `.relationship_tracker` and `tacti.events` | no | yes | Unresolved boundary file tied to session/event contracts. |
| `tacti_core.py` | `MEMORY.md` names it; imports `relationship_tracker`, `arousal_tracker`, `pattern_chunker` by current basename | no | yes | Moving it would immediately break sibling imports. |
| `tacticr_feedback.jsonl` | no in-repo references found | yes from a runtime perspective; not worth isolated churn | no | C_Lawd-local continuity/state file. |
| `tonights_story.md` | no in-repo references found | yes from a runtime perspective; not worth isolated churn | no | C_Lawd-local continuity document. |
| `unified_query.js` | path references in its own CLI usage text; prior extraction evidence names `tests/unified_memory_query.test.js` in the source repo | no | yes | Candidate for shared source, but current path is part of its interface text and split blockers already exist upstream/shared. |

## Repo-level findings

- Direct external references in this repo are mostly documentary rather than runtime imports.
- The risky part is local coupling:
  - `tacti_core.py` imports sibling modules by current basename.
  - `message_hooks.py` and `session_handshake.py` use relative imports.
  - `context_compactor.py`, `event_notifier.py`, and `pattern_chunker.py` embed `workspace/memory/...` and `memory/...` paths.
  - `MEMORY.md` names active modules under `workspace/memory/`.
- Result: physical movement now is not low-risk enough for this pass.

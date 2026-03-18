# Rollback Notes

This pass reduced path and layout coupling inside `workspace/memory/` without moving files or changing remotes/auth.

## Revert procedure

1. Identify the decoupling commit on `codex/refactor/clawd-memory-decoupling`.
2. Revert it with `git revert <decoupling-commit-sha>`.

## Files introduced

- `workspace/memory/paths.py`
- `workspace/audit/_evidence/clawd-memory-decoupling/decoupling-audit.md`
- `workspace/audit/_evidence/clawd-memory-decoupling/git-status.txt`
- `workspace/audit/_evidence/clawd-memory-decoupling/changed-files.txt`
- `workspace/audit/_evidence/clawd-memory-decoupling/rollback-notes.md`

## Files updated

- `MEMORY.md`
- `workspace/memory/BOUNDARY.md`
- `workspace/memory/tacti_core.py`
- `workspace/memory/relationship_tracker.py`
- `workspace/memory/arousal_tracker.py`
- `workspace/memory/context_compactor.py`
- `workspace/memory/conversation_summarizer.py`
- `workspace/memory/event_notifier.py`
- `workspace/memory/pattern_chunker.py`
- `workspace/memory/unified_query.js`

## Intentionally deferred

- Moving files out of `workspace/memory/`
- Refactoring `tacti_core.py` into a new interface shape
- Refactoring unresolved modules (`message_hooks.py`, `session_handshake.py`)
- Removing repo-specific defaults from `unified_query.js`
- Broad cleanup outside the memory boundary

## History discipline

- No reset, rebase, amend, or other history rewrite was performed.

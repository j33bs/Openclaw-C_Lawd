# Memory Boundary Decision

## Decision

- No files were moved in this pass.
- The boundary is now explicit through `workspace/memory/BOUNDARY.md` and this evidence bundle.
- Physical reorganization is deferred until callers, path literals, and broader shared-source blockers are addressed.

## keep_in_clawd

- `workspace/memory/EVOLUTION.md`
- `workspace/memory/c_lawd_reflection.md`
- `workspace/memory/tonights_story.md`
- `workspace/memory/arousal_state.json`
- `workspace/memory/events.json`
- `workspace/memory/relationship.json`
- `workspace/memory/tacticr_feedback.jsonl`
- `workspace/memory/pause_check.py`

Rationale:
- These files look like C_Lawd-local continuity, narrative, persisted relational state, or response-policy material.

## candidate_for_shared_source

- `workspace/memory/tacti_core.py`
- `workspace/memory/relationship_tracker.py`
- `workspace/memory/arousal_tracker.py`
- `workspace/memory/context_compactor.py`
- `workspace/memory/conversation_summarizer.py`
- `workspace/memory/event_notifier.py`
- `workspace/memory/message_parser.py`
- `workspace/memory/pattern_chunker.py`
- `workspace/memory/unified_query.js`

Rationale:
- These files look like reusable state-management, summarization, query, or tracking substrate rather than C_Lawd-only policy.
- They were not moved because their current imports and path assumptions are not yet safely relocatable.

## unresolved

- `workspace/memory/.gitkeep`
- `workspace/memory/message_hooks.py`
- `workspace/memory/session_handshake.py`

Rationale:
- These files sit on the seam between generic event/session plumbing and C_Lawd-local continuity behavior.
- Their final ownership should be decided only after the shared event and handshake contracts are made explicit.

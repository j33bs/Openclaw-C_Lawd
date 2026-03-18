# C_Lawd Memory Decoupling Audit

## Scope

This pass targeted only the `workspace/memory/` shared-engine candidate modules and the one `MEMORY.md` reference that treated the current file placement as canonical.

## Exact blockers found

- `relationship_tracker.py` and `arousal_tracker.py` each embedded their own `workspace/state_runtime/memory/...` default path logic.
- `context_compactor.py` hard-coded `workspace/memory/arousal_state.json`.
- `conversation_summarizer.py` hard-coded `memory/` as its default archive root.
- `event_notifier.py` hard-coded `workspace/memory/events.json`.
- `pattern_chunker.py` hard-coded both `memory/` and `workspace/memory/shortcuts.json`.
- `unified_query.js` repeated repo-root + `workspace/...` joins for governance, knowledge-base, and profile sources, and hard-coded its current CLI entrypoint string.
- `MEMORY.md` named concrete module files under `workspace/memory/` as if their present location were stable.
- `tacti_core.py` still depends on sibling-layout imports and on class-shaped tracker adapters that are not yet part of the decoupled functional tracker interface.

## Blockers reduced in this pass

- Added `workspace/memory/paths.py` as a shared Python resolver for:
  - `workspace/memory/...`
  - `workspace/state_runtime/memory/...`
  - `memory/...`
- Switched these modules to helper-based default path resolution while preserving their existing default behavior:
  - `workspace/memory/relationship_tracker.py`
  - `workspace/memory/arousal_tracker.py`
  - `workspace/memory/context_compactor.py`
  - `workspace/memory/conversation_summarizer.py`
  - `workspace/memory/event_notifier.py`
  - `workspace/memory/pattern_chunker.py`
- Added optional `repo_root` parameters to the affected constructor-based modules so later extraction can inject roots explicitly without changing current callers.
- Centralized repo/workspace default path joins in `workspace/memory/unified_query.js` through `resolveWorkspacePath(...)` and a single `CURRENT_RELATIVE_ENTRYPOINT`.
- Softened `MEMORY.md` so it describes a logical TACTI layer rather than treating the current `workspace/memory/` file list as canonical.
- Updated `workspace/memory/BOUNDARY.md` to record that helper-based path resolution is now in place.

## Blockers remaining

- `workspace/memory/tacti_core.py` still imports sibling modules by current basename and still expects class-shaped `RelationshipTracker` / `ArousalTracker` adapters.
- `workspace/memory/message_hooks.py` and `workspace/memory/session_handshake.py` still rely on relative imports and remain unresolved boundary files.
- `workspace/memory/unified_query.js` still defaults to broader repo-specific governance, knowledge-base, and profile paths even though those joins are now centralized.
- The shared-engine candidates still live in the C_Lawd-local subtree and have not been physically separated.
- `MEMORY.md` still references the workspace memory layer conceptually, which is acceptable for now but means operational docs still assume the layer exists locally.

## What still prevents moving engine-candidate modules later

- `tacti_core.py` needs an explicit adapter/interface decision before it can be moved safely.
- The unresolved modules need a decision on whether they belong with shared engine plumbing or C_Lawd-local continuity/session semantics.
- The JS query module still needs a clearer ownership decision for its governance/profile/knowledge-base adapters.
- Current callers still assume the modules live together under `workspace/memory/`, even if fewer of them now hard-code that path directly.

## Validation

- `python3 -m py_compile workspace/memory/paths.py workspace/memory/relationship_tracker.py workspace/memory/arousal_tracker.py workspace/memory/context_compactor.py workspace/memory/conversation_summarizer.py workspace/memory/event_notifier.py workspace/memory/pattern_chunker.py workspace/memory/tacti_core.py`
- `PYTHONPATH=. python3 -c "import workspace.memory.paths, workspace.memory.relationship_tracker, workspace.memory.arousal_tracker, workspace.memory.context_compactor, workspace.memory.conversation_summarizer, workspace.memory.event_notifier, workspace.memory.pattern_chunker; print('python-import-ok')"`
- `node -e "require('./workspace/memory/unified_query.js'); console.log('node-import-ok')"`

All of the above completed successfully.

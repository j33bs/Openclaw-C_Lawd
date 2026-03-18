# Rollback Notes

This pass is reversible and did not move files, delete foreign trees, rewrite history, or change remotes/auth.

## Revert After Commit

- Revert the adapter-contract commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- workspace/memory/tacti_core.py workspace/memory/tracker_adapters.py workspace/memory/BOUNDARY.md workspace/audit/_evidence/clawd-memory-adapter-contract/`

## Intentionally Deferred

- No migration of `message_hooks.py` or `session_handshake.py` to the class adapters
- No removal of wider repo-owned defaults from `unified_query.js`
- No physical move out of `workspace/memory/`
- No broader TACTI redesign

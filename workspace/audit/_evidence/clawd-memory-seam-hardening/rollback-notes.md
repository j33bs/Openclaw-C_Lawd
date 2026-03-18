# Rollback Notes

This pass is reversible and did not move files, delete foreign trees, rewrite history, or change remotes/auth.

## Revert After Commit

- Revert the seam-hardening commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- workspace/memory/paths.py workspace/memory/tacti_core.py workspace/memory/message_hooks.py workspace/memory/session_handshake.py workspace/memory/unified_query.js workspace/memory/BOUNDARY.md workspace/audit/_evidence/clawd-memory-seam-hardening/`

## Intentionally Deferred

- No physical move out of `workspace/memory/`
- No tracker adapter refactor for `tacti_core.py`
- No event/session contract extraction for `message_hooks.py` or `session_handshake.py`
- No removal of wider repo-owned data defaults from `unified_query.js`
- No broad cleanup of foreign platform trees

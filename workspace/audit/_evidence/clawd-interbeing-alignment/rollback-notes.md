# Rollback Notes

This pass is docs/evidence-first alignment only. It did not implement transport, refactor code, move files, delete foreign trees, rewrite history, or change remotes/auth.

## Revert After Commit

- Revert the interbeing-alignment commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- ARCHITECTURE.md workspace/audit/_evidence/clawd-interbeing-alignment/`

## Intentionally Deferred

- no transport
- no auth/signing
- no retries/timeouts policy
- no streaming protocol implementation
- no memory/query federation
- no event bus implementation
- no bootstrap identity resolution contract
- no local adapter routing redesign

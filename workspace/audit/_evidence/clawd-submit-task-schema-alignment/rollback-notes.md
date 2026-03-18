# Rollback Notes

This pass adds the local `submit_task` emitter to the `main` baseline, aligns it minimally to the interbeing schema when available, and records a focused unittest update plus a local handoff-path smoke artifact.

## Revert After Commit

- Revert the schema-alignment commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- interbeing_contract/ workspace/audit/_evidence/clawd-submit-task-schema-alignment/`

## Intentionally Deferred

- transport implementation
- auth/signing
- broad orchestration integration
- repo pruning or movement
- hard dependency on an external schema checkout

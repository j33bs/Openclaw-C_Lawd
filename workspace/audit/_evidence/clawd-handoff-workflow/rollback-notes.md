# Rollback Notes

This pass adds a real local C_Lawd-to-Dali handoff workflow on top of the existing submit-task emitter: a small CLI, stable handoff directories, focused tests, and evidence only.

## Revert After Commit

- Revert the workflow commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- .gitignore handoff/.gitignore handoff/README.md handoff/archive/dali/.gitkeep handoff/outgoing/dali/.gitkeep interbeing_contract/README.md interbeing_contract/test_submit_task_v0.py scripts/dev/emit_dali_handoff.py scripts/dev/test_emit_dali_handoff.py workspace/audit/_evidence/clawd-handoff-workflow/changed-files.txt workspace/audit/_evidence/clawd-handoff-workflow/git-status.txt workspace/audit/_evidence/clawd-handoff-workflow/handoff-workflow-smoke.md workspace/audit/_evidence/clawd-handoff-workflow/rollback-notes.md`

## Intentionally Deferred

- transport or networking
- auth/signing
- Dali-side consumption logic
- queue management or retries
- repo pruning or broader orchestration refactors

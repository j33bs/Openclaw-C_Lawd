# Rollback Notes

This pass hardens the C_Lawd send helper so that runtime validation provenance is truthful relative to this repo.

## Revert After Commit

- Revert the hardening commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- handoff/README.md interbeing_contract/README.md interbeing_contract/__init__.py interbeing_contract/submit_task_v0.py interbeing_contract/test_submit_task_v0.py scripts/dev/emit_dali_handoff.py scripts/dev/send_to_dali_v0.py scripts/dev/test_emit_dali_handoff.py scripts/dev/test_send_to_dali_v0.py workspace/audit/_evidence/clawd-send-to-dali-validation-provenance/changed-files.txt workspace/audit/_evidence/clawd-send-to-dali-validation-provenance/git-status.txt workspace/audit/_evidence/clawd-send-to-dali-validation-provenance/rollback-notes.md workspace/audit/_evidence/clawd-send-to-dali-validation-provenance/validation-provenance-smoke.md`

## Intentionally Deferred

- Dali-side changes
- transport retries or background workers
- auth/signing
- event vocabulary closure
- treating an external schema file as implicit default when this repo does not contain one

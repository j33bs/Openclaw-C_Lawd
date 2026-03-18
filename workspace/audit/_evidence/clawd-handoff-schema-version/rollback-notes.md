# Rollback Notes

This pass fixes the emitted interbeing envelope field value so the C_Lawd handoff workflow uses the canonical `schema_version` expected by Dali.

## Revert After Commit

- Revert the schema-version fix commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- interbeing_contract/README.md interbeing_contract/submit_task_v0.py interbeing_contract/test_submit_task_v0.py scripts/dev/test_emit_dali_handoff.py workspace/audit/_evidence/clawd-handoff-schema-version/changed-files.txt workspace/audit/_evidence/clawd-handoff-schema-version/git-status.txt workspace/audit/_evidence/clawd-handoff-schema-version/rollback-notes.md workspace/audit/_evidence/clawd-handoff-schema-version/schema-version-fix-smoke.md`

## Intentionally Deferred

- transport or networking
- auth/signing
- Dali-side workflow changes
- any schema contract changes beyond the canonical version string fix

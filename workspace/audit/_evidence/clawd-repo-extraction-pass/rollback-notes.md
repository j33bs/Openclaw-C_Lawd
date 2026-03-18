# Rollback Notes

This extraction-audit pass introduced evidence files and minor boundary-clarifying doc edits only. No destructive extraction was attempted, and no history rewrite occurred.

## Revert procedure

1. Identify the audit commit on `codex/bootstrap/clawd-governed-downstream`.
2. Revert it with `git revert <audit-commit-sha>`.

## Files introduced

- `workspace/audit/_evidence/clawd-repo-extraction-pass/classification.md`
- `workspace/audit/_evidence/clawd-repo-extraction-pass/coupling-blockers.md`
- `workspace/audit/_evidence/clawd-repo-extraction-pass/next-pass-plan.md`
- `workspace/audit/_evidence/clawd-repo-extraction-pass/git-status.txt`
- `workspace/audit/_evidence/clawd-repo-extraction-pass/changed-files.txt`
- `workspace/audit/_evidence/clawd-repo-extraction-pass/rollback-notes.md`

## Files updated

- `README.md`
- `ARCHITECTURE.md`

## Intentionally deferred

- Importing `nodes/c_lawd/`, root identity files, root memory files, `memory/`, or `workspace/memory/`
- Deleting retained foreign/shared platform directories
- Refactoring source/shared coupling blockers
- Changing remotes, auth, runtime behavior, or upstream pin state

## History discipline

- No reset, rebase, amend, or other history rewrite was performed.
- The pass was limited to reversible documentation and evidence changes.

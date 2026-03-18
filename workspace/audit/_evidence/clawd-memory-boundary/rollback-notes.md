# Rollback Notes

This pass made the `workspace/memory/` boundary explicit through documentation and evidence only. No files were moved and no runtime behavior was intentionally changed.

## Revert procedure

1. Identify the boundary commit on `codex/refactor/clawd-memory-boundary`.
2. Revert it with `git revert <boundary-commit-sha>`.

## Files introduced

- `workspace/memory/BOUNDARY.md`
- `workspace/audit/_evidence/clawd-memory-boundary/usage-audit.md`
- `workspace/audit/_evidence/clawd-memory-boundary/boundary-decision.md`
- `workspace/audit/_evidence/clawd-memory-boundary/git-status.txt`
- `workspace/audit/_evidence/clawd-memory-boundary/changed-files.txt`
- `workspace/audit/_evidence/clawd-memory-boundary/rollback-notes.md`

## Files updated

- `ARCHITECTURE.md`

## Intentionally deferred

- Physical relocation of files into `policy/`, `engine_candidates/`, or `unresolved/`
- Refactoring imports or path literals inside `workspace/memory/`
- Refactoring broader shared/source blockers outside the memory boundary
- Deleting any foreign/shared platform tree

## History discipline

- No reset, rebase, amend, or other history rewrite was performed.

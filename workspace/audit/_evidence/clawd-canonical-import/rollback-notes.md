# Rollback Notes

This pass imported canonical C_Lawd-owned roots and made minimal documentation/tracking updates only. No destructive cleanup, blocker refactor, or history rewrite was attempted.

## Revert procedure

1. Identify the import commit on `codex/import/clawd-canonical-roots`.
2. Revert it with `git revert <import-commit-sha>`.

## Files and directories introduced

- `nodes/c_lawd/`
- `IDENTITY.md`
- `USER.md`
- `SOUL.md`
- `MEMORY.md`
- `memory/`
- `workspace/memory/`
- `workspace/audit/_evidence/clawd-canonical-import/`

## Files updated

- `.gitignore`
- `README.md`
- `ARCHITECTURE.md`

## Intentionally deferred

- Deleting foreign/shared platform directories
- Refactoring blocker files in shared/source code
- Normalizing imported path references that still point at broader monorepo/shared locations
- Splitting `workspace/memory/` into final engine vs policy ownership
- Changing remotes or auth configuration

## History discipline

- No reset, rebase, amend, or other history rewrite was performed.

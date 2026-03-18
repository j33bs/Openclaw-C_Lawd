# Import Conflicts

## Path conflicts

- No existing target-repo files or directories were overwritten.
- Before import, the target repo did not contain `nodes/c_lawd/`, root `IDENTITY.md`, `USER.md`, `SOUL.md`, `MEMORY.md`, root `memory/`, or `workspace/memory/`.
- `workspace/` already existed, but the imported `workspace/memory/` subtree did not collide with the existing `workspace/audit/` subtree.

## Tracking conflict

- The target repo's existing `.gitignore` treated `IDENTITY.md`, `USER.md`, and `/memory/` as local workspace state.
- That would have made part of the canonical C_Lawd import present on disk but untrackable in git.
- Resolution:
  - added the narrowest downstream exceptions needed to track the canonical roots:
    - `!IDENTITY.md`
    - `!USER.md`
    - `!memory/`
    - `!memory/**`
    - `!nodes/c_lawd/**`

## Import hygiene exclusions

- `memory/.DS_Store` was excluded as macOS filesystem noise.
- `workspace/memory/__pycache__/` was excluded as runtime-generated Python bytecode cache.

## Deferred conflicts

- Imported content still contains references to broader shared/source paths that may not yet exist in this repo.
- Those are boundary and extraction concerns, not file-path collisions, and were intentionally left unchanged in this pass.

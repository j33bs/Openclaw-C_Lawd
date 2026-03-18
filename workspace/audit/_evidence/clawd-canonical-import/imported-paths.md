# Canonical C_Lawd Import

## Source verification before import

| Canonical path | Source repo status | Target pre-import status | Import result | Notes |
| --- | --- | --- | --- | --- |
| `nodes/c_lawd/` | present | absent | imported | Imported additively under `nodes/c_lawd/`. |
| `IDENTITY.md` | present | absent | imported | Needed a narrow `.gitignore` exception so the canonical downstream root can be tracked. |
| `USER.md` | present | absent | imported | Needed a narrow `.gitignore` exception so the canonical downstream root can be tracked. |
| `SOUL.md` | present | absent | imported | Imported unchanged. |
| `MEMORY.md` | present | absent | imported | Imported unchanged. |
| `memory/` | present | absent | imported | Imported additively with `.DS_Store` excluded as macOS junk. |
| `workspace/memory/` | present | absent | imported | Imported additively with `__pycache__/` excluded as runtime cache. |

## Import fidelity

- File contents were imported faithfully from `/Users/heathyeager/clawd`.
- No canonical file contents were edited during this pass.
- `git diff --cached --check` reports inherited whitespace and blank-line-at-EOF issues in some imported source files; those were left unchanged to preserve import fidelity.
- Two path-hygiene exclusions were applied during copy:
  - `memory/.DS_Store`
  - `workspace/memory/__pycache__/`
- A narrow downstream `.gitignore` adjustment was added so the imported canonical roots are trackable in this repo.

## Imported roots now present in-tree

- `nodes/c_lawd/`
- `IDENTITY.md`
- `USER.md`
- `SOUL.md`
- `MEMORY.md`
- `memory/`
- `workspace/memory/`

## Deferred content cleanup

- Some imported content still references broader monorepo/shared paths such as `workspace/research/*`, `workspace/docs/*`, and `workspace/memory/*`.
- `MEMORY.md` also contains at least one absolute reference to `/Users/heathyeager/clawd/...`.
- Those references were left unchanged in this pass to preserve fidelity and avoid speculative refactors.

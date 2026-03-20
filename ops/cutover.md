# C_Lawd Cutover Checklist

Use this as the practical swap guide when moving from the old `clawd` workspace to this repo.

## Phase 1: Transplant

- Confirm the core continuity files are present at repo root.
- Confirm the `nodes/c_lawd/` identity files are present.
- Keep legacy snapshots only in an archive area, not as live sources.

## Phase 2: Wire

- Repoint any old workspace or home-directory assumptions to this repo.
- Keep memory resolution relative to the repo unless an operator override is explicitly documented.
- Treat Dali handoff paths as operator-configured, not implicit.

## Phase 3: Validate

- Read `SOUL.md`, `USER.md`, and `MEMORY.md` in a main-session context.
- Verify `nodes/c_lawd/CONVERSATION_KERNEL.md` still matches the live conversation posture.
- Run one truthfulness-sensitive flow and confirm receipts are required.
- Run one memory-dependent flow and confirm recall behaves on repo-relative paths.

## Phase 4: Rebind Config

- Set `OPENCLAW_INTERBEING_DALI_REMOTE_HOST` explicitly.
- Set `OPENCLAW_INTERBEING_DALI_REMOTE_USER` explicitly.
- Set `OPENCLAW_INTERBEING_DALI_REMOTE_PORT` explicitly when needed.
- Set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` explicitly when the remote repo root differs.
- Keep secrets out of the repo and in environment or user-level config.

## Operator Checkpoints

- `SOUL.md`
- `USER.md`
- `MEMORY.md`
- `nodes/c_lawd/CONVERSATION_KERNEL.md`
- `nodes/c_lawd/MEMORY.md`
- `handoff/README.md`
- `.env.example`

## Acceptance Criteria

- Identity files resolve from this repo, not the old workspace.
- Memory behavior uses the repo's current paths.
- Source/UI or Dali claims are only made with receipts or verified backend state.
- No active path in the continuity layer still depends on the legacy repo location.

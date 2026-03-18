# Handoff Schema Version Fix Smoke

Date: 2026-03-18
Branch: `codex/fix/clawd-handoff-schema-version`

## Scope

This pass fixes the emitted envelope field value from the legacy `task-envelope.v0` form to the canonical `v0` form expected by Dali and `openclaw-interbeing`.

## Validation Plan

- run focused emitter tests
- run focused handoff workflow tests
- run one real CLI smoke writing a new handoff file
- confirm the newest emitted file contains `\"schema_version\": \"v0\"`
- run `git diff --check`

## Commands Run

- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3 scripts/dev/test_emit_dali_handoff.py`
- `python3 scripts/dev/emit_dali_handoff.py --title 'Schema version fix smoke' --instructions 'Emit a real Dali handoff using the canonical schema_version field value.' --requestor c_lawd --target-node dali --task-id task-schema-version-fix-20260318-001 --correlation-id corr-schema-version-fix-20260318-001 --payload-json '{"source":"clawd-handoff-schema-version-smoke"}'`
- `git diff --check`

## Outcomes

- Emitter tests passed: `Ran 7 tests ... OK`
- Workflow tests passed: `Ran 4 tests ... OK`
- Real CLI smoke validation mode:
  - `fallback_practical_validation`
- Newest emitted outgoing file:
  - `/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-18T13-59-27Z--task-schema-version-fix-20260318-001.task-envelope.v0.json`
- Verified JSON field:
  - `\"schema_version\": \"v0\"`
- `git diff --check` completed cleanly.

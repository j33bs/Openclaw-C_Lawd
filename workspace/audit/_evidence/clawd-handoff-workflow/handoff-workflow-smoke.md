# C_Lawd Handoff Workflow Smoke

Date: 2026-03-18
Branch: `codex/feat/clawd-handoff-workflow`

## Scope

This pass adds a practical local operator workflow for emitting `submit_task` handoff envelopes for Dali from C_Lawd.

## Validation Plan

- run focused emitter tests
- run focused workflow tests
- run one real CLI smoke writing to `handoff/outgoing/dali/`
- run `git diff --check`

## Runtime Validation Mode

- No local `openclaw-interbeing` schema checkout was present on this machine during the smoke.
- The workflow therefore ran in `fallback_practical_validation` mode.

## Commands Run

- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3 scripts/dev/test_emit_dali_handoff.py`
- `python3 scripts/dev/emit_dali_handoff.py --title 'Live handoff smoke' --instructions 'Emit a real local Dali handoff envelope only.' --requestor c_lawd --target-node dali --task-id task-handoff-smoke-20260318-001 --correlation-id corr-handoff-smoke-20260318-001 --payload-json '{"source":"clawd-handoff-workflow-smoke"}'`
- `git diff --check`

## Outcomes

- Emitter tests passed: `Ran 5 tests ... OK`
- Workflow tests passed: `Ran 4 tests ... OK`
- Real handoff CLI smoke wrote:
  - `/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-18T13-46-20Z--task-handoff-smoke-20260318-001.task-envelope.v0.json`
  - `/Users/heathyeager/src/openclaw-c_lawd/handoff/archive/dali/2026-03-18T13-46-20Z--task-handoff-smoke-20260318-001.task-envelope.v0.json`
- Smoke identifiers:
  - `task_id=task-handoff-smoke-20260318-001`
  - `correlation_id=corr-handoff-smoke-20260318-001`
- Runtime validation mode:
  - `fallback_practical_validation`

# C_Lawd Send Validation Provenance Smoke

Date: 2026-03-19
Branch: `codex/harden/clawd-send-to-dali-validation-provenance`

## Scope

This pass removes misleading fallback/schema-path reporting and makes validation provenance explicit and truthful for the C_Lawd-side Interbeing v0 send helper.

## Discovery

- This repo does not contain a canonical `task-envelope.v0.json` schema artifact.
- The in-repo canonical validator is code-backed in `interbeing_contract.submit_task_v0`.
- Schema-file validation remains supported only when an explicit schema path is provided via CLI or environment.

## Commands Run

- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3 scripts/dev/test_emit_dali_handoff.py`
- `python3 scripts/dev/test_send_to_dali_v0.py`
- `python3 scripts/dev/send_to_dali_v0.py --emit --title 'Validation provenance dry run' --instructions 'Emit a canonical v0 submit_task envelope, report truthful validation provenance, and verify the confirmed Dali intake target without transferring.' --event-type 'task.submitted' --payload-json '{"source":"clawd-send-to-dali-validation-provenance-smoke"}' --task-id task-validation-provenance-20260319-001 --correlation-id corr-validation-provenance-20260319-001 --output-dir /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali --remote-host dali --remote-user jeebs --remote-port 22 --remote-dir /home/jeebs/src/openclaw-dali/handoff/incoming/dali/ --dry-run`
- `git diff --check`

## Results

- `interbeing_contract.test_submit_task_v0` passed: `Ran 8 tests ... OK`
- `test_emit_dali_handoff.py` passed: `Ran 5 tests ... OK`
- `test_send_to_dali_v0.py` passed: `Ran 7 tests ... OK`
- The dry-run completed successfully and reported:
  - `local_path=/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-19T05-30-33Z--task-validation-provenance-20260319-001.task-envelope.v0.json`
  - `sha256=c4bd6ac042906f4c4028720d7335501d1a97fe5476f02afab8381a4fe582dc47`
  - `validation_mode=canonical_contract_validation`
  - `validation_source=interbeing_contract.submit_task_v0`
  - `schema_version=v0`
  - `remote_target=jeebs@dali:/home/jeebs/src/openclaw-dali/handoff/incoming/dali/2026-03-19T05-30-33Z--task-validation-provenance-20260319-001.task-envelope.v0.json`
  - `transfer=dry-run`
- `git diff --check` completed cleanly.

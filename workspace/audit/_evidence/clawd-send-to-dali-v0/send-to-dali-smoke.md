# Send To Dali v0 Smoke

Date: 2026-03-19
Branch: `codex/feat/send-to-dali-v0`

## Scope

This pass adds a single-command C_Lawd-side helper that can either emit-and-send or send an existing v0 task envelope to Dali's watcher intake over `scp`, and then hardens it with explicit remote-port support, `sha256` reporting, `--remote-dir` / `--output-dir` ergonomics, and a payload-local `--event-type` annotation.

## Validation Plan

- run focused send-helper tests
- run focused emitter and handoff workflow tests
- run either a live transfer or a dry-run with full local and remote checks
- capture the exact local file path, local `sha256`, remote target, and result
- run `git diff --check`

## Commands Run

- `python3 scripts/dev/test_send_to_dali_v0.py`
- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3 scripts/dev/test_emit_dali_handoff.py`
- `python3 scripts/dev/send_to_dali_v0.py --emit --title 'C_Lawd to Dali dry run' --instructions 'Emit a canonical v0 submit_task envelope and verify the Dali send target without transferring.' --event-type 'task.submitted' --payload-json '{"source":"clawd-send-to-dali-v0-smoke"}' --task-id task-send-to-dali-v0-20260319-003 --correlation-id corr-send-to-dali-v0-20260319-003 --output-dir /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali --remote-host dali --remote-user jeebs --remote-port 22 --remote-dir handoff/incoming/dali/ --dry-run`
- `git diff --check`
- `python3 - <<'PY'` verification of the emitted file's `schema_version`, `operation`, and payload `event_type`

## Outcomes

- Send-helper tests passed: `Ran 7 tests ... OK`
- Emitter tests passed: `Ran 7 tests ... OK`
- Handoff workflow tests passed: `Ran 5 tests ... OK`
- The real helper run emitted a local v0 envelope at:
  - `/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-18T19-40-42Z--task-send-to-dali-v0-20260319-003.task-envelope.v0.json`
- The helper computed the emitted local file digest as:
  - `cf36962a9cb06081f906a07b96159c8c9df53a553ec2ef20ab5be66ad3446f1f`
- The helper resolved the remote target as:
  - `jeebs@dali:handoff/incoming/dali/2026-03-18T19-40-42Z--task-send-to-dali-v0-20260319-003.task-envelope.v0.json`
- The emitted local file was verified to contain:
  - `\"schema_version\": \"v0\"`
  - `\"operation\": \"submit_task\"`
  - `\"payload\": {\"event_type\": \"task.submitted\", ...}`
- Transfer result:
  - `dry-run failed closed`
- Explicit blocker:
  - the explicit target `jeebs@dali:handoff/incoming/dali/` is not a valid intake path from the current SSH landing directory; pass `--remote-dir` or set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact Dali watcher intake directory
- `git diff --check` completed cleanly.

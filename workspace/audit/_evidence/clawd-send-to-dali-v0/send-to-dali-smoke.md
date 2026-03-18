# Send To Dali v0 Smoke

Date: 2026-03-19
Branch: `codex/feat/send-to-dali-v0`

## Scope

This pass adds a single-command C_Lawd-side helper that can either emit-and-send or send an existing v0 task envelope to Dali's watcher intake over `scp`.

## Validation Plan

- run focused send-helper tests
- run focused emitter and handoff workflow tests
- run either a live transfer or a dry-run with full local and remote checks
- capture the exact local file path, remote target, and result
- run `git diff --check`

## Commands Run

- `python3 scripts/dev/test_send_to_dali_v0.py`
- `python3 -m unittest interbeing_contract.test_submit_task_v0`
- `python3 scripts/dev/test_emit_dali_handoff.py`
- `python3 scripts/dev/send_to_dali_v0.py --emit --title 'Send helper dry run' --instructions 'Dry-run remote validation for the C_Lawd to Dali scp helper.' --task-id task-send-to-dali-dryrun-20260319-002 --correlation-id corr-send-to-dali-dryrun-20260319-002 --dry-run`
- `git diff --check`

## Outcomes

- Send-helper tests passed: `Ran 5 tests ... OK`
- Emitter tests passed: `Ran 7 tests ... OK`
- Handoff workflow tests passed: `Ran 4 tests ... OK`
- The real helper run emitted a local v0 envelope at:
  - `/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-18T15-24-45Z--task-send-to-dali-dryrun-20260319-002.task-envelope.v0.json`
- The helper resolved the remote target as:
  - `dali:handoff/incoming/dali/2026-03-18T15-24-45Z--task-send-to-dali-dryrun-20260319-002.task-envelope.v0.json`
- The emitted local file was verified to contain:
  - `\"schema_version\": \"v0\"`
- Transfer result:
  - `dry-run failed closed`
- Explicit blocker:
  - the discovered `dali` alias exists locally, but `handoff/incoming/dali/` is not a valid intake path from that SSH landing directory; pass `--remote-path` or set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact Dali watcher intake directory
- `git diff --check` completed cleanly.

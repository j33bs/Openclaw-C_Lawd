# Local Handoff Workflow

This directory is the local file-based handoff surface for C_Lawd delegation.

- `handoff/outgoing/dali/` receives emitted `submit_task` envelopes for local operator pickup or Dali-side polling.
- `handoff/archive/dali/` keeps archive copies of emitted envelopes when archiving is enabled.
- `scripts/dev/send_to_dali_v0.py` can emit then transfer, or directly transfer, a v0 envelope into Dali's watched intake directory `handoff/incoming/dali/`.
- Runtime JSON handoff files are ignored by git; only the directory structure and docs are tracked.

## Send To Dali

- Emit then send: `python3 scripts/dev/send_to_dali_v0.py --emit --title "..." --instructions "..."`
- Send an existing file: `python3 scripts/dev/send_to_dali_v0.py --file handoff/outgoing/dali/<name>.task-envelope.v0.json`
- Remote-target precedence: CLI args, then `OPENCLAW_INTERBEING_DALI_*` from process env / repo `.env` / `~/.openclaw/.env`, then a discovered local SSH alias named `dali` for the host only.
- Preferred operator flags are `--remote-host`, `--remote-user`, `--remote-port`, and `--remote-dir`. The legacy `--remote-path` flag remains as a compatibility alias.
- `--output-dir` lets the helper write the emitted outgoing artifact under a caller-chosen local directory while preserving the existing archive convention.
- `--event-type` is an optional payload annotation only. It does not change the canonical top-level `submit_task` envelope shape.
- Role and lineage fields are adapter-local and opt-in. `scripts/dev/send_to_dali_v0.py` emits them under `payload.local_dispatch` via `--target-role`, `--source-role`, `--chain-id`, `--parent-task-id`, `--hop-count`, and `--max-hops`.
- The helper prints the emitted local path, the resolved remote destination, the local `sha256`, and truthful validation provenance via `validation_mode` plus `validation_source`.
- In this checkout, the default provenance is `canonical_contract_validation` sourced from `interbeing_contract.submit_task_v0`. Schema-file validation is only claimed when a real schema path is explicitly available.
- If the SSH login directory is not the Dali repo root, pass `--remote-dir` or set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact watcher intake directory.
- `scripts/dev/check_dali_handoff_v0.py` is the read-only downstream lookup surface. It reuses the same remote host/user/port/dir config, derives processed and failed paths from the configured absolute intake path, and prints `processed`, `failed`, `not_found`, or `ambiguous_multiple_matches` without mutating remote state.

Transport, auth/signing, and remote delivery stay outside this directory.

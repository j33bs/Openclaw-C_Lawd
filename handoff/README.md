# Local Handoff Workflow

This directory is the local file-based handoff surface for C_Lawd delegation.

- `handoff/outgoing/dali/` receives emitted `submit_task` envelopes for local operator pickup or Dali-side polling.
- `handoff/archive/dali/` keeps archive copies of emitted envelopes when archiving is enabled.
- `scripts/dev/send_to_dali_v0.py` can emit then transfer, or directly transfer, a v0 envelope into Dali's watched intake directory `handoff/incoming/dali/`.
- Runtime JSON handoff files are ignored by git; only the directory structure and docs are tracked.

## Send To Dali

- Local sibling-lane wrapper: `npm run interbeing:emit -- --task-id task-demo-001 --prompt "..."`
- Emit then send: `python3 scripts/dev/send_to_dali_v0.py --emit --title "..." --instructions "..."`
- Send an existing file: `python3 scripts/dev/send_to_dali_v0.py --file handoff/outgoing/dali/<name>.task-envelope.v0.json`
- `npm run interbeing:emit` defaults to the sibling Dali intake `../openclaw-dali/handoff/incoming/dali/` when present.
- Override the sibling default with `OPENCLAW_DALI_INTAKE_DIR=/custom/path/handoff/incoming/dali npm run interbeing:emit -- ...` or `npm run interbeing:emit -- --intake-dir /custom/path/handoff/incoming/dali ...`.
- Remote-target precedence: CLI args, then `OPENCLAW_INTERBEING_DALI_*` from process env / repo `.env` / `~/.openclaw/.env`, then a discovered local SSH alias named `dali` for the host only.
- Preferred operator flags are `--remote-host`, `--remote-user`, `--remote-port`, and `--remote-dir`. The legacy `--remote-path` flag remains as a compatibility alias.
- `--output-dir` lets the helper write the emitted outgoing artifact under a caller-chosen local directory while preserving the existing archive convention.
- `--event-type` is an optional payload annotation only. It does not change the canonical top-level `submit_task` envelope shape.
- Role and lineage fields are adapter-local and opt-in. `scripts/dev/send_to_dali_v0.py` emits them under `payload.local_dispatch` via `--target-role`, `--source-role`, `--chain-id`, `--parent-task-id`, `--hop-count`, and `--max-hops`.
- The local sibling wrapper exposes the same lineage shape behind `--include-local-dispatch` and keeps wrapper-only evidence under `workspace/audit/_evidence/interbeing-emitter-v0/`.
- Concrete task contract fields are also adapter-local under `payload.local_dispatch.task_contract`. `scripts/dev/send_to_dali_v0.py` exposes them with `--task-class`, repeatable `--acceptance-criterion`, `--review-mode`, `--worker-limit`, and `--execution-notes`.
- `scripts/dev/emit_planner_fanout_v0.py` is the bounded planner fan-out helper. It reads a local child-spec list, emits local child envelopes plus a local manifest, defaults emitted children to `source_role=planner` and `target_role=executor`, and only sends children when `--send` is explicitly set.
- Planner fan-out remains operator-invoked only. The local child cap is helper behavior, not a canonical Interbeing v0 field.
- The helper prints the emitted local path, the resolved remote destination, the local `sha256`, and truthful validation provenance via `validation_mode` plus `validation_source`.
- In this checkout, the default provenance is `canonical_contract_validation` sourced from `interbeing_contract.submit_task_v0`. Schema-file validation is only claimed when a real schema path is explicitly available.
- If the SSH login directory is not the Dali repo root, pass `--remote-dir` or set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact watcher intake directory.
- `scripts/dev/check_dali_handoff_v0.py` is the read-only downstream lookup surface. It reuses the same remote host/user/port/dir config, derives processed and failed paths from the configured absolute intake path, and prints `processed`, `failed`, `not_found`, or `ambiguous_multiple_matches` without mutating remote state.

Transport, auth/signing, and remote delivery stay outside this directory.

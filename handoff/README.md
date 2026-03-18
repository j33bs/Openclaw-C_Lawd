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
- The helper prints the emitted local path, the resolved remote destination, and the local `sha256` so emitted files remain replayable and auditable.
- If the SSH login directory is not the Dali repo root, pass `--remote-dir` or set `OPENCLAW_INTERBEING_DALI_INTAKE_PATH` to the exact watcher intake directory.

Transport, auth/signing, and remote delivery stay outside this directory.

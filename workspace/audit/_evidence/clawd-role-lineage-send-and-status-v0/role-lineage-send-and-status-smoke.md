# C_Lawd Role/Lineage Send And Status Evidence

- Branch: `codex/feat/clawd-role-lineage-send-and-status-v0`
- Commit hash: recorded in the operator handoff after the commit is created
- Scope: adapter-local role and lineage metadata on send, plus read-only downstream disposition lookup from C_Lawd

## Commands Run

```bash
python3 -m unittest interbeing_contract.test_submit_task_v0
python3 scripts/dev/test_emit_dali_handoff.py
python3 scripts/dev/test_send_to_dali_v0.py
python3 scripts/dev/test_check_dali_handoff_v0.py
python3 scripts/dev/send_to_dali_v0.py \
  --emit \
  --title 'Role lineage dry run' \
  --instructions 'Emit a role-aware and lineage-aware handoff without transferring.' \
  --event-type 'task.submitted' \
  --source-role planner \
  --target-role executor \
  --chain-id chain-role-lineage-001 \
  --parent-task-id task-parent-000 \
  --hop-count 1 \
  --max-hops 3 \
  --payload-json '{"source":"clawd-role-lineage-send-status-smoke"}' \
  --task-id task-role-lineage-20260319-001 \
  --correlation-id corr-role-lineage-20260319-001 \
  --output-dir /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali \
  --remote-host dali \
  --remote-user jeebs \
  --remote-port 22 \
  --remote-dir /home/jeebs/src/openclaw-dali/handoff/incoming/dali/ \
  --dry-run
python3 scripts/dev/check_dali_handoff_v0.py \
  --filename 2026-03-19T05-22-20Z--task-send-to-dali-v0-live-20260319-001.task-envelope.v0.json \
  --remote-host dali \
  --remote-user jeebs \
  --remote-port 22 \
  --remote-dir /home/jeebs/src/openclaw-dali/handoff/incoming/dali/
git diff --check
```

## Results

- `interbeing_contract.test_submit_task_v0`: passed (`Ran 8 tests ... OK`)
- `scripts/dev/test_emit_dali_handoff.py`: passed (`Ran 6 tests ... OK`)
- `scripts/dev/test_send_to_dali_v0.py`: passed (`Ran 8 tests ... OK`)
- `scripts/dev/test_check_dali_handoff_v0.py`: passed (`Ran 6 tests ... OK`)
- Role/lineage dry-run emitted a canonical `v0` envelope and reported truthful validation provenance:
  - `local_path=/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-19T12-21-45Z--task-role-lineage-20260319-001.task-envelope.v0.json`
  - `sha256=c98c40963b8ff00671b489dd1ef7f684f9c09a5d3ded6481777f3c3f0e7f8e24`
  - `validation_mode=canonical_contract_validation`
  - `validation_source=interbeing_contract.submit_task_v0`
  - `schema_version=v0`
  - `target_role=executor`
  - `source_role=planner`
  - `chain_id=chain-role-lineage-001`
  - `parent_task_id=task-parent-000`
  - `hop_count=1`
  - `max_hops=3`
  - `transfer=dry-run`
- Read-only downstream lookup over SSH resolved a known processed artifact:
  - `disposition=processed`
  - `file_path=/home/jeebs/src/openclaw-dali/handoff/processed/dali/2026-03-19T05-22-20Z--task-send-to-dali-v0-live-20260319-001.task-envelope.v0.json`
  - `receipt_path=/home/jeebs/src/openclaw-dali/handoff/processed/dali/2026-03-19T05-22-20Z--task-send-to-dali-v0-live-20260319-001.task-envelope.v0.receipt.json`
  - `reason_code=processed`
  - `sha256=c21ad1501c42f7643ba736ada620f521e6cde61bc3e5db167d69b1540c537950`
  - `task_id=task-send-to-dali-v0-live-20260319-001`

## Residual Uncertainty

- Role and lineage metadata are adapter-local under `payload.local_dispatch`; Dali-side consumers may ignore them until explicitly taught to read them.
- `task_id` and `chain_id` lookups can be ambiguous when more than one remote artifact matches; the helper reports `ambiguous_multiple_matches` instead of guessing.

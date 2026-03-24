# C_Lawd Concrete Dispatch Contract v0 Evidence

- Branch: `codex/feat/clawd-concrete-dispatch-contract-v0`
- Commit hash: recorded in the operator handoff after the commit is created
- Scope: adapter-local concrete task contract emission plus bounded planner fan-out on top of the existing C_Lawd Interbeing v0 send flow

## Commands Run

```bash
python3 -m unittest interbeing_contract.test_submit_task_v0
python3 scripts/dev/test_emit_dali_handoff.py
python3 scripts/dev/test_send_to_dali_v0.py
python3 scripts/dev/test_emit_planner_fanout_v0.py
python3 scripts/dev/test_check_dali_handoff_v0.py
python3 scripts/dev/send_to_dali_v0.py \
  --emit \
  --title 'Concrete planner executor handoff' \
  --instructions 'Produce a concise execution summary and return evidence-backed output.' \
  --event-type 'task.submitted' \
  --source-role planner \
  --target-role executor \
  --chain-id chain-concrete-dispatch-001 \
  --parent-task-id task-parent-concrete-001 \
  --hop-count 1 \
  --max-hops 3 \
  --task-class executor_work \
  --acceptance-criterion 'produce summary' \
  --acceptance-criterion 'cite evidence' \
  --review-mode peer_review \
  --worker-limit 2 \
  --execution-notes 'Keep the response concise and operator-visible.' \
  --payload-json '{"source":"clawd-concrete-dispatch-smoke"}' \
  --task-id task-concrete-dispatch-20260319-001 \
  --correlation-id corr-concrete-dispatch-20260319-001 \
  --output-dir /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali \
  --remote-host dali \
  --remote-user jeebs \
  --remote-port 22 \
  --remote-dir /home/jeebs/src/openclaw-dali/handoff/incoming/dali/ \
  --dry-run
python3 scripts/dev/emit_planner_fanout_v0.py \
  --parent-task-id task-parent-concrete-001 \
  --chain-id chain-concrete-dispatch-001 \
  --child-specs-file workspace/audit/_evidence/clawd-concrete-dispatch-contract-v0/fanout-child-specs.json \
  --max-hops 3 \
  --output-dir /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali \
  --manifest-path /Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-19T12-50-00Z--task-parent-concrete-001.planner-manifest.v0.json \
  --send \
  --dry-run \
  --remote-host dali \
  --remote-user jeebs \
  --remote-port 22 \
  --remote-dir /home/jeebs/src/openclaw-dali/handoff/incoming/dali/
git diff --check
```

## Results

- `interbeing_contract.test_submit_task_v0`: passed (`Ran 8 tests ... OK`)
- `scripts/dev/test_emit_dali_handoff.py`: passed (`Ran 6 tests ... OK`)
- `scripts/dev/test_send_to_dali_v0.py`: passed (`Ran 12 tests ... OK`)
- `scripts/dev/test_emit_planner_fanout_v0.py`: passed (`Ran 5 tests ... OK`)
- `scripts/dev/test_check_dali_handoff_v0.py`: passed (`Ran 6 tests ... OK`)
- Concrete contract dry-run emitted a canonical `v0` envelope and reported truthful validation provenance:
  - `local_path=/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-19T12-46-31Z--task-concrete-dispatch-20260319-001.task-envelope.v0.json`
  - `sha256=ea1dfe528dcabe912e9b963d3d3f93df88dc3ab3635c7a180ca944384b412a64`
  - `validation_mode=canonical_contract_validation`
  - `validation_source=interbeing_contract.submit_task_v0`
  - `schema_version=v0`
  - `target_role=executor`
  - `source_role=planner`
  - `chain_id=chain-concrete-dispatch-001`
  - `parent_task_id=task-parent-concrete-001`
  - `hop_count=1`
  - `max_hops=3`
  - `task_class=executor_work`
  - `acceptance_criteria_json=["produce summary", "cite evidence"]`
  - `review_mode=peer_review`
  - `worker_limit=2`
  - `execution_notes=Keep the response concise and operator-visible.`
  - `transfer=dry-run`
- Bounded planner fan-out dry-run emitted a local manifest plus two child envelopes:
  - `manifest_path=/Users/heathyeager/src/openclaw-c_lawd/handoff/outgoing/dali/2026-03-19T12-50-00Z--task-parent-concrete-001.planner-manifest.v0.json`
  - `parent_task_id=task-parent-concrete-001`
  - `chain_id=chain-concrete-dispatch-001`
  - `validation_mode=canonical_contract_validation`
  - `validation_source=interbeing_contract.submit_task_v0`
  - `child_count=2`
  - `child_filenames_json=["2026-03-19T12-46-31Z--task-fanout-child-001.task-envelope.v0.json", "2026-03-19T12-46-31Z--task-fanout-child-002.task-envelope.v0.json"]`
  - `send_mode=dry-run`
- Bounded fan-out failure behavior is covered by focused tests:
  - rejects child spec counts above the local cap of `8`
  - rejects planner-target children by default
  - rejects `hop_count > max_hops`

## Residual Uncertainty

- Concrete task contract fields and planner fan-out semantics remain adapter-local under `payload.local_dispatch`; downstream consumers may ignore them until explicitly taught to read them.
- The planner fan-out helper emits child envelopes incrementally before writing the final manifest; if one child emission or transfer fails mid-run, partial local artifacts may remain for operator inspection.

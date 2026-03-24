# Rollback Notes

- Branch: `codex/feat/clawd-concrete-dispatch-contract-v0`
- Commit hash: recorded in the operator handoff after the commit is created
- Revert command: `git revert --no-edit <commit-sha>`

## What This Pass Changed

- Extended `scripts/dev/send_to_dali_v0.py` with adapter-local concrete dispatch contract fields under `payload.local_dispatch.task_contract`
- Added the bounded planner fan-out helper `scripts/dev/emit_planner_fanout_v0.py`
- Added focused tests, concise docs, and an evidence bundle for the new orchestration surface

## What Was Intentionally Deferred

- No Dali-side changes
- No Interbeing repo changes
- No autonomous fan-out, polling loop, retries, queueing, daemonization, or background services
- No canonical protocol/schema changes

## Safety Notes

- No file moves or destructive cleanup were attempted
- Single-envelope send behavior remains unchanged and still reports truthful validation provenance
- Planner fan-out remains operator-invoked and capped locally

# Rollback Notes

- Branch: `codex/feat/clawd-role-lineage-send-and-status-v0`
- Commit hash: recorded in the operator handoff after the commit is created
- Revert command: `git revert --no-edit <commit-sha>`

## What This Pass Changed

- Added adapter-local role and lineage metadata support to `scripts/dev/send_to_dali_v0.py`
- Added a read-only downstream disposition helper at `scripts/dev/check_dali_handoff_v0.py`
- Added focused tests and concise operational docs

## What Was Intentionally Deferred

- No Dali-side changes
- No Interbeing contract changes
- No transport, retries, daemonization, polling service, or queueing
- No mutation of remote processed, failed, or receipt state

## Safety Notes

- No file moves or destructive cleanup were attempted
- The downstream status helper is SSH read-only and fails closed on remote path ambiguity

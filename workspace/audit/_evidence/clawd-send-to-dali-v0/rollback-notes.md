# Rollback Notes

This pass adds an adapter-only C_Lawd helper for emit-and-send or send-existing interbeing v0 handoff files to Dali via `scp`.

## Revert After Commit

- Revert the send-helper commit with `git revert --no-edit <commit-sha>`.

## Revert Before Commit

- Discard the working-tree changes from this pass with `git restore --source=HEAD -- .env.example handoff/README.md interbeing_contract/README.md scripts/dev/send_to_dali_v0.py scripts/dev/test_send_to_dali_v0.py workspace/audit/_evidence/clawd-send-to-dali-v0/changed-files.txt workspace/audit/_evidence/clawd-send-to-dali-v0/git-status.txt workspace/audit/_evidence/clawd-send-to-dali-v0/rollback-notes.md workspace/audit/_evidence/clawd-send-to-dali-v0/send-to-dali-smoke.md`

## Intentionally Deferred

- transport or RPC layers
- auth/signing
- watcher lifecycle polling
- schema changes
- retries or queue management

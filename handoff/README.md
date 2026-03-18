# Local Handoff Workflow

This directory is the local file-based handoff surface for C_Lawd delegation.

- `handoff/outgoing/dali/` receives emitted `submit_task` envelopes for local operator pickup or Dali-side polling.
- `handoff/archive/dali/` keeps archive copies of emitted envelopes when archiving is enabled.
- Runtime JSON handoff files are ignored by git; only the directory structure and docs are tracked.

Transport, auth/signing, and remote delivery stay outside this directory.

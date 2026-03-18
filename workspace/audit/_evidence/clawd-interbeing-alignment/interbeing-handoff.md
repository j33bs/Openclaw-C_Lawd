# C_Lawd Interbeing Handoff

Date: 2026-03-18

## C_Lawd Concepts That Should Later Adapt To Interbeing v0

- delegation lifecycle operations:
  - `submit_task`
  - `poll_status`
  - `stream_result`
  - `cancel_task`
- shared request/result metadata:
  - `task_id`
  - `node_id`
  - `requestor`
  - `target_node`
  - `status`
  - `event_type`
  - `correlation_id`
  - `timestamp`
- observable provenance around delegated work:
  - summary refs
  - artifact refs
  - emitted lifecycle metadata

## Exact Local Things That Must Remain Local

- root identity and bootstrap files:
  - `IDENTITY.md`
  - `USER.md`
  - `SOUL.md`
  - `MEMORY.md`
- local continuity artifacts under `memory/`
- C_Lawd narrative and reflective material in `workspace/memory/`
- local tracker heuristics and TACTI scoring choices
- repo-local bootstrap/orientation conventions
- local adapter routing inside `workspace/memory/`
- repo-specific governance, knowledge-base, and profile defaults

## Local Seams That May Emit Shared Concepts But Are Not Interbeing

- `workspace/memory/tracker_adapters.py`
- `workspace/memory/message_hooks.py`
- `workspace/memory/session_handshake.py`
- `workspace/memory/relationship_tracker.py`
- `workspace/memory/arousal_tracker.py`
- `workspace/memory/unified_query.js`

These files can later adapt to interbeing-facing fields or envelopes, but they should stay implementation-local unless a shared contract explicitly requires otherwise.

## Mismatches To Resolve Later

- `session_id` is not yet a shared `task_id`
- local being names are not yet a standardized `node_id` resolution contract
- local event names are not yet normalized to a shared `event_type`
- local metadata can support correlation, but there is no explicit shared `correlation_id`
- local status-like concepts are not yet constrained to a shared v0 status vocabulary

## Deferred By Interbeing v0 And Therefore Not To Be Forced Into This Repo

- transport implementation
- auth/signing
- retries/timeouts policy
- streaming protocol details
- memory/query federation
- event bus implementation
- bootstrap identity resolution contract
- richer capability discovery
- adapter routing inside local repos

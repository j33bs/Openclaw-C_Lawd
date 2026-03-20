# Inter-Being Contract v0

This directory holds the placeholder contract for the C_Lawd to Dali boundary. The contract is intentionally small until shared protocol work is extracted to a dedicated repository.

## Tentative Operations

- `submit_task`
- `poll_status`
- `stream_result`
- `cancel_task`

## Initial Direction

- C_Lawd requests, frames, and interprets work.
- Dali executes heavy or long-running tasks.
- Both sides emit observable events with a shared schema for task identity, state transitions, timestamps, provenance, and error reporting.

## Design Principles

- explicit contracts over hidden coupling
- observable events over silent state mutation
- reversible delegation over one-way ownership transfer
- local implementation freedom behind stable shared semantics

## Future Home

If this boundary grows beyond placeholder status, the shared ontology and protocol should move to `openclaw-interbeing` rather than being duplicated across downstream repos.

## Local Envelope Emission

- `interbeing_contract/submit_task_v0.py` is a local C_Lawd-side adapter for emitting `submit_task` envelopes only.
- In this repo, canonical validation is code-backed by `interbeing_contract.submit_task_v0` unless an operator explicitly points the adapter at a real `task-envelope.v0.json` schema file.
- It builds and writes envelope JSON locally, can validate against an explicit canonical `task-envelope.v0.json` when one is provided, and supports an explicit handoff path for local file-based consumption.
- The schema file name remains `task-envelope.v0.json`, but the emitted envelope field must be `\"schema_version\": \"v0\"`.
- `npm run interbeing:emit -- ...` is the tracked operator surface. It writes directly into a local Dali intake only when a real local lane exists (`--intake-dir`, `OPENCLAW_DALI_INTAKE_DIR`, or the sibling `../openclaw-dali/handoff/incoming/dali/`), otherwise it falls through to the existing remote Dali ssh/scp lane and still records wrapper-only audit evidence under `workspace/audit/_evidence/interbeing-emitter-v0/`.
- The tracked wrapper carries the accepted local-dispatch lineage subset and may also emit accepted adapter-local `payload.local_dispatch.task_contract` fields. Those task-contract fields remain local metadata only and do not change the canonical v0 envelope.
- `scripts/dev/emit_dali_handoff.py` is the operator-facing workflow entrypoint. By default it emits to `handoff/outgoing/dali/`, archives to `handoff/archive/dali/`, and reports `validation_mode` plus `validation_source` so runtime provenance stays truthful.
- `scripts/dev/send_to_dali_v0.py` layers on top of that emitter to either emit-and-send or send an existing envelope to Dali via `scp`, targeting `handoff/incoming/dali/` by default, printing the emitted file `sha256`, and failing closed on missing config, invalid paths, or transfer errors.
- Optional operator ergonomics such as `--event-type` and role/lineage metadata stay adapter-local inside the emitted `payload` (with role/lineage nested under `payload.local_dispatch`); they do not redefine the canonical top-level v0 envelope semantics.
- Adapter-local `payload.local_dispatch` fields in this repo:

| Field                               | Type             | Local rule                                                                                        |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `source_role`                       | string           | Current role for the emitting helper, typically `planner`.                                        |
| `target_role`                       | string           | Intended downstream role; helper-local vocabulary is currently `planner`, `executor`, `reviewer`. |
| `chain_id`                          | string           | Shared lineage identifier across related handoffs.                                                |
| `parent_task_id`                    | string           | Parent task reference for child handoffs.                                                         |
| `hop_count`                         | integer          | Non-negative lineage depth for the emitted handoff.                                               |
| `max_hops`                          | integer          | Positive lineage-depth bound; this does not define sibling fan-out count.                         |
| `task_contract.task_class`          | string           | Concrete local task category for planner/executor/reviewer orchestration.                         |
| `task_contract.acceptance_criteria` | array of strings | Operator-defined acceptance checks for the concrete task.                                         |
| `task_contract.review_mode`         | string           | Local review expectation for the task.                                                            |
| `task_contract.worker_limit`        | integer          | Positive local worker cap for the task.                                                           |
| `task_contract.execution_notes`     | string           | Additional local execution guidance.                                                              |

- Any local child-count cap remains helper behavior; it is not a canonical Interbeing v0 field unless explicitly serialized by a future shared contract update.
- Transport, auth/signing, and Dali-side consumption remain separate and deferred.

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

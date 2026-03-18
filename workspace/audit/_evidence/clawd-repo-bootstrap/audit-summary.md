# C_Lawd Bootstrap Audit Summary

## Scope and method

- Audited the downstream repository after `git fetch --all --prune` on 2026-03-18.
- Verified that the external C_Lawd extraction source contains the claimed ownership roots: `nodes/c_lawd/`, `MEMORY.md`, `USER.md`, `SOUL.md`, `IDENTITY.md`, `memory/`, and provisional `workspace/memory/`.
- Searched the target repo for Dali-specific naming, heavy execution paths, large-model or local-model assumptions, scheduler/bootstrap logic, and central-memory ownership assumptions.

## Brief rationale

- Safe bootstrap should clarify provenance, role, and boundaries before altering platform behavior.
- Hidden Dali coupling in code is currently low; the larger risk is capability overlap being mistaken for ownership.
- The correct first move is to keep upstream compatibility, narrow downstream defaults and docs, and classify heavier surfaces for later extraction or delegation.

## High-level findings

- Downstream `HEAD` matches `dali/main`; `upstream/main` is one commit ahead after fetch. The current downstream base should remain pinned pending validation.
- No Dali-branded code references were found under `src/`, `extensions/`, `apps/`, or `package.json`; current coupling risk is architectural rather than name-based.
- Heavy capability surfaces are present as generic OpenClaw platform features: scheduler/cron, subagent orchestration, vector memory/indexing, LanceDB auto-recall/capture, and optional local-model support.
- The repo already includes first-class workspace identity/bootstrap primitives (`SOUL.md`, `IDENTITY.md`, `USER.md`, `MEMORY.md`) that fit a C_Lawd-first downstream posture without invasive code changes.

## Keep

- Base assistant/control-plane platform surfaces in `src/agents/`, `src/channels/`, and `src/gateway/`.
- Workspace bootstrap and identity primitives such as `SOUL.md`, `IDENTITY.md`, `USER.md`, and `MEMORY.md`.
- The new downstream governance layer in `UPSTREAM.md`, `ROLE.md`, `ARCHITECTURE.md`, and `interbeing_contract/README.md`.

## Isolate

- `src/cron/`, `src/cli/cron-cli/`, and macOS cron settings/editor surfaces:
  valid platform automation features, but they should not define C_Lawd's core identity.
- `src/agents/subagent-*`, `tools.subagents`, and related subagent lifecycle logic:
  useful for light delegation, but they need a clearer downstream boundary when used for long-running orchestration.
- `src/memory/` and `extensions/memory-lancedb/`:
  keep available as optional local memory/search features, not as assumed central memory ownership.
- Optional heavy or local-model support in `package.json` and memory providers (`node-llama-cpp`, Ollama, LanceDB):
  valid platform capability, but not a default expectation for a lighter user-facing node.

## Deprecate Later

- Downstream wording that frames this repo primarily as an orchestration node rather than a personal/research assistant.
- Any future downstream configuration that silently enables heavyweight cron, auto-capture, or local-LLM paths for the default assistant without explicit operator intent.

## Migrate To Dali Later

- Ownership of heavy research ingestion pipelines or central knowledge-store operations if they are introduced into this downstream.
- Any memory plugin posture that turns auto-recall or auto-capture into the canonical multi-being substrate rather than optional user-local memory.
- High-volume or long-lived automation that behaves more like system orchestration than a user-facing assistant.

## Candidate For Future Interbeing Repo

- Shared delegation lifecycle operations: `submit_task`, `poll_status`, `stream_result`, `cancel_task`.
- Shared observable event schema for task identity, provenance, state transitions, timestamps, and errors.
- Cross-being ontology or protocol that must be shared by C_Lawd and Dali without being owned by either downstream.

## Deferred risky areas

- No refactor was attempted in `src/cron/`, `src/memory/`, `extensions/memory-lancedb/`, or subagent runtime code.
- No upstream fast-forward was attempted even though `upstream/main` advanced by one commit.
- No extraction or deletion of heavy platform features was attempted in this bootstrap phase.

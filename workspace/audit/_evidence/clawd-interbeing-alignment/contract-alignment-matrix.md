# C_Lawd To Interbeing v0 Alignment Matrix

Date: 2026-03-18

| Local concept | Interbeing v0 concept | Status | Notes |
| --- | --- | --- | --- |
| explicit delegation from C_Lawd to another being | `submit_task` | `aligns_now` | The repo already frames C_Lawd as the requestor/interpreter and Dali as the heavy executor in `ARCHITECTURE.md` and `interbeing_contract/README.md`. |
| status polling / operator-facing follow-up | `poll_status` | `aligns_now` | The intent exists in the documented boundary, though no transport is implemented here. |
| result interpretation and surfaced outcomes | `stream_result` | `needs_adapter` | Local docs say C_Lawd interprets results, but no standardized local result envelope or stream shape is defined yet. |
| stopping or withdrawing delegated work | `cancel_task` | `deferred` | v0 names it, but the local repo does not yet expose a concrete cancellation surface. |
| local session/task-like identifiers such as `session_id` | `task_id` | `needs_adapter` | `session_id` exists locally, but it is not yet a standardized cross-being task identifier. |
| stable being names like `c_lawd` / `dali` | `node_id` | `needs_adapter` | Node identity exists conceptually and in docs, but local identity resolution is intentionally not yet part of the shared contract. |
| local author/source/operator semantics | `requestor` | `needs_adapter` | Local concepts exist (`author`, `source`, operator role), but they are not normalized to one shared field yet. |
| C_Lawd choosing Dali or another being for heavy work | `target_node` | `needs_adapter` | The target concept is clear in architecture docs, but it is not yet represented as a stable shared field in local artifacts. |
| session close/open state, task lifecycle wording, summary status | `status` | `needs_adapter` | Status-like concepts exist locally, but they are not yet constrained to a v0 lifecycle vocabulary. |
| local event names such as `tacti_cr.session.handshake_loaded` | `event_type` | `needs_adapter` | Local event typing exists, but it is still repo-local and not normalized to an interbeing event taxonomy. |
| `session_id`, summary refs, artifact refs, and emitted metadata | `correlation_id` | `needs_adapter` | Correlation is possible from existing metadata, but there is no explicit shared `correlation_id` field yet. |
| `ts_utc` and similar emitted timestamps | `timestamp` | `aligns_now` | Timestamp semantics are already explicit in the local seam. |
| root identity docs and bootstrap posture | bootstrap identity resolution contract | `local_only` | Interbeing v0 explicitly defers bootstrap identity resolution. Local root docs should remain local. |
| local narrative memory, continuity files, tracker heuristics | memory/query federation | `local_only` | Interbeing v0 explicitly defers memory/query federation. Local continuity and heuristics should not move into interbeing. |
| transport, auth/signing, retries/timeouts, event bus details | corresponding deferred v0 topics | `deferred` | These are intentionally outside scope for this repo pass and should remain unimplemented here. |
| local adapter routing inside `workspace/memory/` | adapter routing inside local repos | `local_only` | Interbeing v0 explicitly defers local adapter routing; C_Lawd should keep this seam internal. |

## Summary

- `aligns_now`: delegation intent, polling intent, and timestamp semantics
- `needs_adapter`: shared task/node/event identifiers and standardized result/status envelopes
- `local_only`: bootstrap identity, local continuity memory, tracker heuristics, and local adapter routing
- `deferred`: transport, auth, retries/timeouts, streaming protocol details, federation, and event-bus implementation

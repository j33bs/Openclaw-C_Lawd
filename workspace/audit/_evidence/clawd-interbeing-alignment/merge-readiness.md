# C_Lawd Merge Readiness Against Interbeing v0

Date: 2026-03-18
Branch reviewed: `codex/docs/clawd-interbeing-alignment`

## Stable Enough For Merge Now

- downstream governance and provenance docs
- imported canonical C_Lawd-owned roots
- explicit `workspace/memory/` boundary documentation
- reduced `workspace/memory/` path/layout coupling
- explicit tracker adapter contract for `tacti_core.py`
- local docs/evidence alignment against the interbeing v0 concept list

These changes are additive, reversible, and do not implement transport or broader ownership changes.

## Intentionally Deferred

- transport implementation
- auth/signing
- retries/timeouts policy
- streaming protocol details
- memory/query federation
- event bus implementation
- bootstrap identity resolution contract
- richer capability discovery
- adapter routing inside local repos

## Whether `main` Can Be Updated After Interbeing v0 Review

- Yes, if interbeing v0 review confirms that the shared contract stays narrow: task lifecycle operations plus shared task/node/event identity fields.
- No additional local code refactor is required before merging this documentation/evidence alignment.
- A later prune/shrink pass should remain separate from the merge of this stack.

## What Still Blocks A Later Repo-Pruning Pass

- `workspace/memory/message_hooks.py` and `workspace/memory/session_handshake.py` still sit on a local tracker seam that needs an ownership decision
- `workspace/memory/unified_query.js` still defaults to wider repo-owned governance, knowledge-base, and profile sources
- engine-candidate modules still physically live under `workspace/memory/`
- earlier shared/source blockers remain unresolved for hard extraction:
  - `plugins/openclaw_surface_router_plugin/index.js`
  - `workspace/policy/system_map.json`
  - `workspace/runtime_hardening/src/telegram_route_provenance.mjs`
  - `tests/node_identity.test.js`
  - `tests/unified_memory_query.test.js`
  - `tests/system2_http_edge.test.js`

## Merge Recommendation

- Merge the governed downstream stack first.
- Review interbeing v0 handoff and alignment next.
- Schedule pruning only after the unresolved local/session/query seams and the shared/source blockers are handled in a dedicated follow-up branch.

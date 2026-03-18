# C_Lawd Memory Seam Hardening Audit

Date: 2026-03-18
Branch: `codex/refactor/clawd-memory-seam-hardening`
Base: `codex/refactor/clawd-memory-decoupling`

## Scope

This pass hardened the remaining `workspace/memory/` extraction seam without moving files or changing the runtime layout. The changes were limited to:

- `workspace/memory/tacti_core.py`
- `workspace/memory/message_hooks.py`
- `workspace/memory/session_handshake.py`
- `workspace/memory/unified_query.js`
- `workspace/memory/paths.py`
- `workspace/memory/BOUNDARY.md`

## Blockers Addressed

### `tacti_core.py`

- Reduced import-time sibling-layout coupling by replacing top-level sibling imports with lazy local resolution helpers.
- Kept the current adapter contract explicit: the module now imports cleanly as part of `workspace.memory`, and the remaining class-shaped tracker assumption fails only when `TacticCore()` is instantiated.

### `message_hooks.py`

- Reduced package-only coupling by adding a local-script import fallback alongside the existing package-relative imports.
- Kept the event-processing contract unchanged.

### `session_handshake.py`

- Reduced package-only coupling by adding local-script import fallbacks for tracker/path helpers.
- Replaced the hard-coded handshake artifact directory join with `resolve_state_runtime_memory_path("handshakes", ...)`.
- Reduced root-vs-workspace identity coupling by resolving `SOUL.md`, `USER.md`, and `MEMORY.md` from canonical root locations first, with a workspace fallback for compatibility.
- Isolated the optional `tacti.events` dependency behind `_emit_session_event(...)`.

### `unified_query.js`

- Kept current adapter behavior but made broader repo-wide source assumptions explicit through `COMPATIBILITY_DEFAULT_SOURCE_PATHS`.
- Replaced repeated inline defaults with a single compatibility-path resolver so later extraction can override those defaults in one place.

## Blockers Remaining

- `tacti_core.py` still depends on `RelationshipTracker` and `ArousalTracker` class-shaped adapters that are not present in the imported tracker modules.
- `message_hooks.py` and `session_handshake.py` still live beside the tracker modules they coordinate; physical extraction will require an explicit event/session contract, not just import fallbacks.
- `session_handshake.py` still has optional wider-repo assumptions around orientation building (`store.orient`) and event emission (`tacti.events`), even though both are now isolated behind narrow helpers/fallbacks.
- `unified_query.js` still defaults to wider repo-owned governance, knowledge-base, and profile sources; those defaults are now explicit but still block standalone movement unless callers provide narrower adapters or explicit paths.
- Engine-candidate modules still physically live under `workspace/memory/`.

## What Still Prevents Physical Extraction

- No extracted adapter/interface exists yet for the tracker classes expected by `tacti_core.py`.
- `message_hooks.py` and `session_handshake.py` still rely on direct local tracker module imports rather than an extracted event/memory contract.
- `unified_query.js` still couples to shared-source data ownership by default.
- The subsystem has not been repackaged into a dedicated package or relocated subtree.

## Recommended Next Step

Create one explicit compatibility contract pass for the unresolved runtime-facing interfaces:

- define or shim the tracker adapter interface used by `tacti_core.py`
- decide whether `message_hooks.py` and `session_handshake.py` belong with C_Lawd policy or a shared event/memory contract
- require explicit adapter/path injection for `unified_query.js` before any physical move

## Validation

- `python3 -m py_compile workspace/memory/paths.py workspace/memory/tacti_core.py workspace/memory/message_hooks.py workspace/memory/session_handshake.py` -> passed
- `python3` import smoke for `workspace.memory.tacti_core`, `workspace.memory.message_hooks`, and `workspace.memory.session_handshake` -> passed
- `_identity_snapshot(Path('.'))` in `session_handshake.py` -> resolved root-level `SOUL.md`, `USER.md`, and `MEMORY.md`
- `TacticCore()` instantiation -> still fails with an explicit adapter-contract `ImportError`, which is the remaining blocker being preserved rather than hidden
- `node --check workspace/memory/unified_query.js` -> passed
